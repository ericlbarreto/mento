"use client";

// The board's camera: pan (drag, wheel, arrows), inertia, zoom (ctrl/⌘ + wheel, pinch) and the follow camera that
// looks where the tutor draws. The camera lives in refs and is written straight to the DOM (no React render per move).
import { useEffect, useRef, useState } from "react";
import type { BoardStore, ElementState } from "../store";
import type { BoardWriter } from "./writer";
import {
  type Camera,
  type Inset,
  type Rect,
  centerOn,
  clampCamera,
  clampScale,
  easeOutCubic,
  exceedsDragThreshold,
  followTarget,
  inertiaStep,
  initialCamera,
  isMoving,
  lerpCamera,
  wheelZoomFactor,
  zoomAt,
} from "./camera";

/** Pause the follow camera for this long after the student pans or zooms by hand. */
const MANUAL_IDLE_MS = 4000;
const FOLLOW_MS = 400;
const ZOOM_STEP = 1.2;
/** Dotted paper tile at scale 1 (matches the session page's paper). */
export const PAPER_TILE_PX = 24;
/** Never start a drag on these: the answer box, buttons, links, the board's own controls. */
const INTERACTIVE = "input, textarea, select, button, a, label, [contenteditable], [data-board-control]";
/** Release after holding still this long: no fling. */
const FLING_IDLE_MS = 60;

export interface CanvasControls {
  zoomIn(): void;
  zoomOut(): void;
  /** Back to scale 1 (or fit) centered on the latest content. */
  recenter(): void;
  /** Resume following now (the "Voltar para a aula" pill). */
  resume(): void;
  /** Pans by screen pixels (drag auto-scroll); counts as a manual move. */
  panBy(dx: number, dy: number): void;
  /** Suspends the follow camera for the next 4 s (a block is being dragged). */
  hold(): void;
  /** Called after every camera change (the edit toolbar keeps its place on screen). */
  subscribe(listener: () => void): () => void;
}

/** Below this zoom the block toolbar is hidden (too small to aim at). */
export const TOOLBAR_MIN_SCALE = 0.6;

type Point = { x: number; y: number };
type Engine = Omit<CanvasControls, "subscribe">;

const isEditable = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, button, a, [contenteditable]");

/** With a `writer`, the camera looks at the element being written instead of jumping to the newest one. */
export function useCanvasCamera(store: BoardStore, mainWidth: number, writer?: BoardWriter) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [cameraListeners] = useState(() => new Set<() => void>());
  // False after a manual pan/zoom until the camera follows again: shows the "Voltar para a aula" pill.
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    const world = worldRef.current;
    const paper = paperRef.current;
    if (!viewport || !world || !paper) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let cam: Camera = { x: 0, y: 0, scale: 1 };
    let raf = 0;
    let manualAt = -Infinity;
    let lastId: string | null = null;
    let followingNow = true;
    const setFollowingOnce = (v: boolean) => {
      if (followingNow === v) return;
      followingNow = v;
      setFollowing(v);
    };

    const vp = () => ({ w: viewport.clientWidth, h: viewport.clientHeight });
    const worldSize = () => ({ w: world.offsetWidth, h: world.offsetHeight });
    // The host may publish how much of the board's bottom its overlays cover (caption, orb, notices) as
    // `--board-safe-bottom` (px); without it, keep a fixed band clear.
    const safeBottom = () => {
      const v = parseFloat(getComputedStyle(viewport).getPropertyValue("--board-safe-bottom"));
      return Number.isFinite(v) && v > 0 ? Math.min(v, vp().h * 0.7) : Math.min(260, vp().h * 0.35);
    };
    const inset = (): Inset => ({ top: 24, right: 32, bottom: safeBottom(), left: 32 });
    const fitScale = () => initialCamera(vp(), mainWidth).scale;

    const write = () => {
      world.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.scale})`;
      const tile = PAPER_TILE_PX * cam.scale;
      paper.style.backgroundSize = `${tile}px ${tile}px`;
      paper.style.backgroundPosition = `${cam.x}px ${cam.y}px`;
      // Screen-sized overlays inside the world (the block toolbar) divide by this.
      viewport.style.setProperty("--board-scale", String(cam.scale));
      if (cam.scale < TOOLBAR_MIN_SCALE) viewport.dataset.zoomedOut = "";
      else delete viewport.dataset.zoomedOut;
      cameraListeners.forEach((l) => l());
    };
    const set = (next: Camera) => {
      cam = clampCamera(next, vp(), worldSize());
      write();
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const markManual = () => {
      stop();
      manualAt = performance.now();
      setFollowingOnce(false);
    };

    const animateTo = (target: Camera, ms = FOLLOW_MS) => {
      stop();
      const to = clampCamera(target, vp(), worldSize());
      if (motion.matches) return set(to);
      const from = cam;
      const start = performance.now();
      const frame = (now: number) => {
        const t = (now - start) / ms;
        set(lerpCamera(from, to, easeOutCubic(t)));
        raf = t < 1 ? requestAnimationFrame(frame) : 0;
      };
      raf = requestAnimationFrame(frame);
    };

    const local = (clientX: number, clientY: number): Point => {
      const r = viewport.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };
    const rectOf = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      const w = world.getBoundingClientRect();
      return {
        x: (r.left - w.left) / cam.scale,
        y: (r.top - w.top) / cam.scale,
        w: r.width / cam.scale,
        h: r.height / cam.scale,
      };
    };
    const elementById = (id: string) => world.querySelector(`[data-element-id="${CSS.escape(id)}"]`);

    const bringIntoView = (el: Element) => {
      const target = followTarget(cam, vp(), rectOf(el), inset());
      if (target) animateTo(target);
    };
    const follow = (id: string) => {
      lastId = id;
      if (performance.now() - manualAt < MANUAL_IDLE_MS) return;
      // Still waiting for the pen: the writer focuses it when it starts.
      if (writer?.isQueued(id)) return;
      const el = elementById(id);
      if (!el) return;
      setFollowingOnce(true);
      bringIntoView(el);
    };
    let followTimer: ReturnType<typeof setTimeout> | undefined;
    // Wait for React to commit the element (and lay it out) before measuring it.
    const scheduleFollow = (id: string) => {
      lastId = id;
      clearTimeout(followTimer);
      followTimer = setTimeout(() => requestAnimationFrame(() => follow(id)), 50);
    };

    const recenter = () => {
      manualAt = -Infinity;
      setFollowingOnce(true);
      const el = lastId ? elementById(lastId) : null;
      animateTo(el ? centerOn(fitScale(), vp(), rectOf(el), inset()) : initialCamera(vp(), mainWidth));
    };
    const resume = () => {
      manualAt = -Infinity;
      setFollowingOnce(true);
      const el = lastId ? elementById(lastId) : null;
      if (el) bringIntoView(el);
      else animateTo(initialCamera(vp(), mainWidth));
    };
    const zoomBy = (factor: number) => {
      markManual();
      const { w, h } = vp();
      animateTo(zoomAt(cam, factor, w / 2, h / 2), 200);
    };
    engine.current = {
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
      recenter,
      resume,
      panBy(dx, dy) {
        markManual();
        set({ ...cam, x: cam.x + dx, y: cam.y + dy });
      },
      hold: markManual,
    };

    // --- Pointer: drag to pan, two fingers to pinch, fling on release.
    const pointers = new Map<number, Point>();
    let mode: "none" | "pending" | "pan" | "pinch" = "none";
    let start: Point = { x: 0, y: 0 };
    let last: Point = { x: 0, y: 0 };
    let samples: { t: number; x: number; y: number }[] = [];
    let pinch = { dist: 0, mid: { x: 0, y: 0 } };
    let dragged = false;
    let spaceHeld = false;
    let hovering = false;

    const pinchState = () => {
      const [a = start, b = start] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const beginPan = (id: number, p: Point) => {
      mode = "pan";
      dragged = true;
      last = p;
      samples = [{ t: performance.now(), ...p }];
      try {
        viewport.setPointerCapture(id);
      } catch {
        // The pointer may already be gone.
      }
      viewport.dataset.panning = "";
      markManual();
    };

    const onPointerDown = (e: PointerEvent) => {
      dragged = false;
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(INTERACTIVE)) return;
      const forced = e.button === 1 || spaceHeld;
      // Mouse and pen over an element keep clicks and text selection; touch pans from anywhere.
      if (!forced && e.pointerType !== "touch" && target?.closest("[data-element-id]")) return;
      if (forced) e.preventDefault();
      stop();
      const p = local(e.clientX, e.clientY);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        mode = "pinch";
        dragged = true;
        pinch = pinchState();
        for (const id of pointers.keys()) {
          try {
            viewport.setPointerCapture(id);
          } catch {
            // Ignore: capture is best effort.
          }
        }
        markManual();
      } else if (pointers.size === 1) {
        start = p;
        if (forced) beginPan(e.pointerId, p);
        else mode = "pending";
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e.clientX, e.clientY);
      pointers.set(e.pointerId, p);
      if (mode === "pending") {
        if (!exceedsDragThreshold(p.x - start.x, p.y - start.y)) return;
        // Pan from the press point, so the content stays under the pointer.
        beginPan(e.pointerId, start);
      }
      if (mode === "pan") {
        set({ ...cam, x: cam.x + p.x - last.x, y: cam.y + p.y - last.y });
        last = p;
        const now = performance.now();
        samples.push({ t: now, ...p });
        while (samples.length > 2 && now - (samples[0]?.t ?? now) > 100) samples.shift();
        return;
      }
      if (mode === "pinch" && pointers.size === 2) {
        const next = pinchState();
        const zoomed = zoomAt(cam, pinch.dist > 0 ? next.dist / pinch.dist : 1, next.mid.x, next.mid.y);
        set({ ...zoomed, x: zoomed.x + next.mid.x - pinch.mid.x, y: zoomed.y + next.mid.y - pinch.mid.y });
        pinch = next;
      }
    };
    const fling = () => {
      const first = samples[0];
      const end = samples[samples.length - 1];
      if (motion.matches || !first || !end) return;
      const dt = end.t - first.t;
      if (dt <= 0 || performance.now() - end.t > FLING_IDLE_MS) return;
      let vx = (end.x - first.x) / dt;
      let vy = (end.y - first.y) / dt;
      if (!isMoving(vx, vy)) return;
      let prev = performance.now();
      const frame = (now: number) => {
        const step = inertiaStep(vx, vy, now - prev);
        prev = now;
        const before = cam;
        set({ ...cam, x: cam.x + step.dx, y: cam.y + step.dy });
        vx = step.vx;
        vy = step.vy;
        // Stop when slow, or when the bounds hold the camera.
        const moved = Math.abs(cam.x - before.x) + Math.abs(cam.y - before.y) > 0.01;
        raf = isMoving(vx, vy) && moved ? requestAnimationFrame(frame) : 0;
      };
      raf = requestAnimationFrame(frame);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (mode === "pinch") {
        // One finger left: keep panning with it, no fling.
        const rest = [...pointers.entries()][0];
        if (rest) {
          mode = "pan";
          last = rest[1];
          samples = [];
        } else {
          mode = "none";
          setTimeout(() => (dragged = false), 0);
        }
        return;
      }
      if (pointers.size > 0) return;
      if (mode === "pan") {
        delete viewport.dataset.panning;
        // The drag's own click (if any) is dispatched right after pointerup; later clicks are real.
        setTimeout(() => (dragged = false), 0);
        if (e.type === "pointerup") fling();
      }
      mode = "none";
    };
    // A drag ends in a click on the viewport; swallow it so click-and-ask does not see it.
    const onClickCapture = (e: MouseEvent) => {
      // detail 0: keyboard activation, never the end of a drag.
      if (!dragged || e.detail === 0) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    };

    // --- Wheel: trackpad two-finger scroll pans both axes; ctrl/⌘ + wheel (and trackpad pinch) zooms.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      markManual();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp().h : 1;
      if (e.ctrlKey || e.metaKey) {
        const p = local(e.clientX, e.clientY);
        set(zoomAt(cam, wheelZoomFactor(e.deltaY * unit), p.x, p.y));
        return;
      }
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
      set({ ...cam, x: cam.x - dx, y: cam.y - dy });
    };
    // Safari reports trackpad pinch as gesture events instead of ctrl+wheel.
    let gestureBase = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = cam.scale;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      markManual();
      const p = local(g.clientX, g.clientY);
      set(zoomAt(cam, clampScale(gestureBase * g.scale) / cam.scale, p.x, p.y));
    };

    // --- Keyboard: arrows pan, +/- zoom, 0 recenters (board or an element focused). Space + drag pans over elements.
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      const step = e.shiftKey ? 240 : 60;
      const pan: Record<string, Point> = {
        ArrowLeft: { x: step, y: 0 },
        ArrowRight: { x: -step, y: 0 },
        ArrowUp: { x: 0, y: step },
        ArrowDown: { x: 0, y: -step },
      };
      const d = pan[e.key];
      if (d) {
        e.preventDefault();
        markManual();
        set({ ...cam, x: cam.x + d.x, y: cam.y + d.y });
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        recenter();
      }
    };
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !hovering || isEditable(e.target)) return;
      e.preventDefault();
      spaceHeld = true;
      viewport.dataset.space = "";
    };
    const releaseSpace = () => {
      spaceHeld = false;
      delete viewport.dataset.space;
    };
    const onWindowKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") releaseSpace();
    };
    const onEnter = () => (hovering = true);
    const onLeave = () => (hovering = false);
    // Keyboard focus on an element brings it into view (the viewport clips instead of scrolling).
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target instanceof Element ? e.target.closest("[data-element-id]") : null;
      if (el && el.matches(":focus-visible")) bringIntoView(el);
    };
    // A generated image grows its element after the follow: look again.
    const onLoad = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("[data-element-id]") : null;
      if (el && lastId && (el as HTMLElement).dataset.elementId === lastId) follow(lastId);
    };

    // --- Store: new elements, draw_result replacing a placeholder and highlight/circle move the camera.
    let prevElements: ReadonlyMap<string, ElementState> = store.getState().elements;
    const unsubscribeAdded = store.subscribeAdded(scheduleFollow);
    // The tutor moved a block: look at it once the reflow (240 ms) settled.
    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeLayout = store.subscribeLayout(({ kind, id, by }) => {
      if (kind !== "move" || by !== "tutor") return;
      lastId = id;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => requestAnimationFrame(() => follow(id)), 260);
    });
    const unsubscribeAll = store.subscribe(() => {
      const next = store.getState().elements;
      if (next.size === 0 && prevElements.size > 0) {
        lastId = null;
        manualAt = -Infinity;
        setFollowingOnce(true);
        animateTo(initialCamera(vp(), mainWidth));
      }
      for (const [id, el] of next) {
        const prev = prevElements.get(id);
        if (!prev || prev === el) continue;
        const drawn = prev.status === "placeholder" && el.status === "ready";
        if (drawn || el.annotations.length > prev.annotations.length) scheduleFollow(id);
      }
      prevElements = next;
    });

    // The pen starts an element (frame it once) or its caret's line leaves the safe area (bring that line in).
    const unsubscribeFocus = writer?.subscribeFocus(({ id, rect }) => {
      lastId = id;
      if (performance.now() - manualAt < MANUAL_IDLE_MS) return;
      const el = rect ? null : elementById(id);
      if (!rect && !el) return;
      setFollowingOnce(true);
      const target = followTarget(cam, vp(), rect ?? rectOf(el as Element), inset());
      if (target) animateTo(target);
    });

    const resize = new ResizeObserver(() => set(cam));
    cam = initialCamera(vp(), mainWidth);
    set(cam);
    resize.observe(viewport);
    resize.observe(world);

    const passive = { passive: false } as const;
    viewport.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    viewport.addEventListener("click", onClickCapture, true);
    viewport.addEventListener("wheel", onWheel, passive);
    viewport.addEventListener("gesturestart", onGestureStart, passive);
    viewport.addEventListener("gesturechange", onGestureChange, passive);
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("pointerenter", onEnter);
    viewport.addEventListener("pointerleave", onLeave);
    viewport.addEventListener("focusin", onFocusIn);
    world.addEventListener("load", onLoad, true);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      stop();
      clearTimeout(followTimer);
      unsubscribeAdded();
      unsubscribeLayout();
      clearTimeout(moveTimer);
      unsubscribeAll();
      unsubscribeFocus?.();
      resize.disconnect();
      engine.current = null;
      viewport.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      viewport.removeEventListener("click", onClickCapture, true);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("gesturestart", onGestureStart);
      viewport.removeEventListener("gesturechange", onGestureChange);
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("pointerenter", onEnter);
      viewport.removeEventListener("pointerleave", onLeave);
      viewport.removeEventListener("focusin", onFocusIn);
      world.removeEventListener("load", onLoad, true);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, [store, mainWidth, writer, cameraListeners]);

  const controls: CanvasControls = {
    zoomIn: () => engine.current?.zoomIn(),
    zoomOut: () => engine.current?.zoomOut(),
    recenter: () => engine.current?.recenter(),
    resume: () => engine.current?.resume(),
    panBy: (dx, dy) => engine.current?.panBy(dx, dy),
    hold: () => engine.current?.hold(),
    subscribe: (listener) => {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
  };
  return { viewportRef, worldRef, paperRef, following, controls };
}
