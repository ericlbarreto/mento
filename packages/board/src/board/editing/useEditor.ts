"use client";

// The student's board editing (plan F): select a block, delete it (deferred send, undo), move it with the handle
// or the keyboard. DOM listeners on the viewport and direct DOM writes for the drag (ghost, insertion bar), like the
// camera: no React render per pointer move.
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Column } from "@mento/contracts";
import { type BoardStore, anchorOf } from "../../store";
import type { CanvasControls } from "../useCanvasCamera";
import type { BoardWriter } from "../writer";
import { type BoardEditingEnv, type BoardEditor, createSelection } from "./context";
import { createFlip } from "./flip";
import {
  type DropTarget,
  type MoveKey,
  editPermissions,
  isSamePlace,
  pickColumn,
  slotAt,
  slotLabel,
  stepTarget,
} from "./model";
import { newEditId } from "./outbox";

/** A press on the handle becomes a drag after this many px (no long-press). */
export const DRAG_START_PX = 6;
/** Auto-scroll band at the viewport edges and its top speed. */
const EDGE_PX = 48;
const EDGE_MAX_PX = 12;
/** Half the gap between blocks (gap-5): the insertion bar sits in the middle of it. */
const HALF_GAP_PX = 10;
const BAR_PX = 3;

const INTERACTIVE =
  "input, textarea, select, button, a, label, [contenteditable], [data-board-control]";
const isEditable = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]");

export const columnLabel: Record<Column, string> = {
  main: "Explicação",
  visuals: "Imagens",
  side: "Anotações",
};

interface Move {
  id: string;
  via: "pointer" | "keyboard";
  origin: DropTarget;
  target: DropTarget;
}

export function useEditor({
  store,
  writer,
  editing,
  openQuestionId,
  viewportRef,
  worldRef,
  camera,
}: {
  store: BoardStore;
  writer: BoardWriter;
  editing?: BoardEditingEnv;
  openQuestionId: string | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  worldRef: RefObject<HTMLDivElement | null>;
  camera: CanvasControls;
}) {
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  const barRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ editing, openQuestionId, camera });
  useEffect(() => {
    latest.current = { editing, openQuestionId, camera };
  });

  const editor = useMemo(() => {
    const selection = createSelection();
    const reduced = () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const flip = createFlip(() => worldRef.current, reduced);
    const announce = (text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 }));
    const world = () => worldRef.current;
    const scaleOf = (w: HTMLElement) =>
      w.offsetWidth > 0 ? w.getBoundingClientRect().width / w.offsetWidth : 1;
    const frameOf = (id: string) =>
      world()?.querySelector<HTMLElement>(
        `[data-column] > [data-element-id="${CSS.escape(id)}"]`,
      ) ?? null;

    const permissions = (id: string) => {
      const env = latest.current.editing;
      const el = store.getElement(id);
      if (!env || !el) return null;
      return editPermissions(el, {
        writing: false,
        locked: env.lockedIds.has(id),
        openQuestionId: latest.current.openQuestionId,
      });
    };
    /** At action time the pen counts too: a block still being written cannot be touched. */
    const allowed = (id: string, what: "move" | "remove") =>
      !writer.isWriting(id) && !writer.isQueued(id) && !!permissions(id)?.[what];

    const select = (id: string | null) => {
      selection.set(id);
      latest.current.editing?.onSelect?.(id);
    };
    const focusFrame = (id: string | null) =>
      requestAnimationFrame(() => {
        const f = id ? frameOf(id) : null;
        (f ?? viewportRef.current)?.focus({ preventScroll: !f });
      });

    const remove = (id: string, { focusNext = false } = {}) => {
      const env = latest.current.editing;
      const frame = frameOf(id);
      if (!env || !allowed(id, "remove") || frame?.dataset.removing !== undefined) return;
      const siblings = frame
        ? [
            ...(frame.parentElement?.querySelectorAll<HTMLElement>(":scope > [data-element-id]") ??
              []),
          ]
        : [];
      const at = frame ? siblings.indexOf(frame) : -1;
      const next = (siblings[at + 1] ?? siblings[at - 1])?.dataset.elementId ?? null;
      const finish = () => {
        const state = store.getState();
        const element = state.elements.get(id);
        if (!element) return;
        const removed = { element, after_id: anchorOf(state, id) };
        flip.capture();
        store.applyEdit({ op: "remove", element_id: id });
        env.outbox.hold({ op: "remove", edit_id: newEditId(), element_id: id }, removed);
        if (selection.get() === id) selection.set(null);
        env.onRemoved?.(id);
        announce("Bloco apagado. Use Desfazer ou Ctrl+Z para trazer de volta.");
        if (focusNext) focusFrame(next);
      };
      if (!frame || reduced() || typeof frame.animate !== "function") return finish();
      frame.dataset.removing = "";
      frame
        .animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.97)" },
          ],
          { duration: 150, easing: "ease-out", fill: "forwards" },
        )
        .finished.then(finish, finish);
    };

    const undo = () => {
      const env = latest.current.editing;
      const removed = env?.outbox.undo();
      if (!removed) return;
      flip.capture();
      store.restoreRemoved(removed);
      announce("Bloco restaurado.");
      focusFrame(removed.element.id);
    };

    // --- Move (pointer drag or keyboard move mode)
    let move: Move | null = null;
    let raf = 0;
    let pointer = { x: 0, y: 0 };
    let grab = { x: 0, y: 0 };
    let unsubscribeStore: (() => void) | null = null;

    const hideBar = () => {
      if (barRef.current) barRef.current.style.display = "none";
      world()
        ?.querySelectorAll<HTMLElement>("[data-drop-target]")
        .forEach((s) => delete s.dataset.dropTarget);
    };
    /** World-space spans of a column's blocks, the moving one excluded. */
    const spansOf = (w: HTMLElement, column: Column, skip: string) => {
      const wr = w.getBoundingClientRect();
      const scale = scaleOf(w);
      const section = w.querySelector<HTMLElement>(`[data-column="${column}"]`);
      const frames = section
        ? [...section.querySelectorAll<HTMLElement>(":scope > [data-element-id]")]
        : [];
      return {
        section,
        spans: frames
          .filter((f) => f.dataset.elementId !== skip)
          .map((f) => {
            const r = f.getBoundingClientRect();
            return {
              id: f.dataset.elementId as string,
              top: (r.top - wr.top) / scale,
              bottom: (r.bottom - wr.top) / scale,
            };
          }),
      };
    };
    const showBar = (target: DropTarget, skip: string) => {
      const w = world();
      const bar = barRef.current;
      if (!w || !bar) return;
      const { section, spans } = spansOf(w, target.column, skip);
      if (!section) return hideBar();
      w.querySelectorAll<HTMLElement>("[data-drop-target]").forEach(
        (s) => s !== section && delete s.dataset.dropTarget,
      );
      section.dataset.dropTarget = "";
      const wr = w.getBoundingClientRect();
      const scale = scaleOf(w);
      const sr = section.getBoundingClientRect();
      const anchor = target.after_id === null ? null : spans.find((s) => s.id === target.after_id);
      const first = spans[0];
      const y = anchor
        ? anchor.bottom + HALF_GAP_PX
        : first
          ? first.top - HALF_GAP_PX
          : (sr.top - wr.top) / scale + 8;
      bar.style.display = "block";
      bar.style.left = `${(sr.left - wr.left) / scale}px`;
      bar.style.width = `${sr.width / scale}px`;
      bar.style.top = `${y - BAR_PX / 2}px`;
    };

    const end = (commit: boolean) => {
      const m = move;
      if (!m) return;
      move = null;
      cancelAnimationFrame(raf);
      unsubscribeStore?.();
      unsubscribeStore = null;
      hideBar();
      ghostRef.current?.replaceChildren();
      const frame = frameOf(m.id);
      if (frame) delete frame.dataset.dragging;
      const env = latest.current.editing;
      const state = store.getState();
      if (commit && env && state.elements.has(m.id) && !isSamePlace(state, m.id, m.target)) {
        flip.capture();
        const edit = {
          op: "move" as const,
          element_id: m.id,
          column: m.target.column,
          after_id: m.target.after_id,
        };
        store.applyEdit(edit);
        env.outbox.send({ ...edit, edit_id: newEditId() });
        announce(`Bloco movido para ${columnLabel[m.target.column]}.`);
      } else if (m.via === "keyboard") announce("Movimento cancelado.");
      setDragging(false);
      latest.current.camera.hold();
      if (m.via === "keyboard") focusFrame(m.id);
    };

    const begin = (id: string, via: Move["via"]) => {
      const el = store.getElement(id);
      if (!el) return false;
      // The pen finishes now and stays finished while the block is carried (new blocks appear written).
      writer.finishAll();
      unsubscribeStore = store.subscribe(() => {
        writer.finishAll();
        if (move && !store.getElement(move.id)) end(false);
      });
      const origin = { column: el.column, after_id: anchorOf(store.getState(), id) };
      move = { id, via, origin, target: origin };
      latest.current.camera.hold();
      setDragging(true);
      const frame = frameOf(id);
      if (frame) frame.dataset.dragging = "";
      return true;
    };

    const enterMoveMode = (id: string) => {
      if (move || !allowed(id, "move") || !begin(id, "keyboard")) return;
      requestAnimationFrame(() => move && showBar(move.target, id));
      announce("Modo mover: setas escolhem o lugar, Enter solta, Esc cancela.");
    };
    const onMoveKey = (e: KeyboardEvent) => {
      const m = move;
      if (!m) return;
      if (e.key === "Tab") return end(false);
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return end(false);
      if (e.key === "Enter" || e.key === " ") return end(true);
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const next = stepTarget(store.getState(), m.id, m.target, e.key as MoveKey);
      m.target = next;
      // Empty columns get their drop zone this render; place the bar after it.
      requestAnimationFrame(() => move && showBar(move.target, m.id));
      const { position, total } = slotLabel(store.getState(), m.id, next);
      announce(`${columnLabel[next.column]}, posição ${position} de ${total}.`);
    };

    // Pointer drag from the handle.
    let pending: { id: string; pointerId: number; x: number; y: number } | null = null;
    const tick = () => {
      const m = move;
      const w = world();
      const vp = viewportRef.current;
      if (!m || m.via !== "pointer" || !w || !vp) return;
      const vr = vp.getBoundingClientRect();
      const speed = (d: number) =>
        d < EDGE_PX ? Math.min(EDGE_MAX_PX, EDGE_MAX_PX * (1 - Math.max(0, d) / EDGE_PX)) : 0;
      const dx = speed(pointer.x - vr.left) - speed(vr.right - pointer.x);
      const dy = speed(pointer.y - vr.top) - speed(vr.bottom - pointer.y);
      if (dx || dy) latest.current.camera.panBy(dx, dy);
      const wr = w.getBoundingClientRect();
      const scale = scaleOf(w);
      const x = (pointer.x - wr.left) / scale;
      const y = (pointer.y - wr.top) / scale;
      const ghost = ghostRef.current?.firstElementChild as HTMLElement | null | undefined;
      if (ghost) ghost.style.transform = `translate(${x - grab.x}px, ${y - grab.y}px) rotate(1deg)`;
      const columns = [...w.querySelectorAll<HTMLElement>("[data-column]")].map((s) => {
        const r = s.getBoundingClientRect();
        return {
          column: s.dataset.column as Column,
          left: (r.left - wr.left) / scale,
          right: (r.right - wr.left) / scale,
        };
      });
      const column = pickColumn(m.target.column, x, columns);
      m.target = { column, after_id: slotAt(y, spansOf(w, column, m.id).spans) };
      showBar(m.target, m.id);
      raf = requestAnimationFrame(tick);
    };
    const startPointerDrag = (id: string) => {
      const frame = frameOf(id);
      const w = world();
      if (!frame || !w || !begin(id, "pointer")) return;
      const fr = frame.getBoundingClientRect();
      const scale = scaleOf(w);
      grab = { x: (pointer.x - fr.left) / scale, y: (pointer.y - fr.top) / scale };
      if (!reduced() && ghostRef.current) {
        // A copy of the block follows the pointer (0.6 opacity, tilted 1°); reduced motion keeps only the bar.
        const clone = frame.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-element-id");
        clone.removeAttribute("tabindex");
        clone.removeAttribute("data-dragging");
        clone
          .querySelectorAll("[data-board-control], [id]")
          .forEach((n) =>
            n.matches("[data-board-control]") ? n.remove() : n.removeAttribute("id"),
          );
        clone.style.cssText = `width:${frame.offsetWidth}px;opacity:0.6;transform-origin:0 0;outline:none;pointer-events:none;`;
        ghostRef.current.replaceChildren(clone);
      }
      raf = requestAnimationFrame(tick);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pending && e.pointerId === pending.pointerId) {
        pointer = { x: e.clientX, y: e.clientY };
        if (!move && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) >= DRAG_START_PX)
          startPointerDrag(pending.id);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pending || e.pointerId !== pending.pointerId) return;
      pending = null;
      if (move?.via !== "pointer") return;
      const vr = viewportRef.current?.getBoundingClientRect();
      const inside =
        !!vr &&
        e.type === "pointerup" &&
        pointer.x >= vr.left &&
        pointer.x <= vr.right &&
        pointer.y >= vr.top &&
        pointer.y <= vr.bottom;
      // Dropped outside the board: it snaps back.
      end(inside);
    };
    const startDrag = (e: PointerEvent, id: string, handle: HTMLElement) => {
      if (e.button !== 0 || move || !allowed(id, "move")) return;
      e.preventDefault();
      pending = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      pointer = { x: e.clientX, y: e.clientY };
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // Best effort.
      }
    };

    // --- Viewport listeners: click selects, keys delete / move, Ctrl/⌘+Z undoes.
    const blockOf = (t: EventTarget | null) =>
      t instanceof HTMLElement && t.dataset.elementId && t.parentElement?.matches("[data-column]")
        ? t.dataset.elementId
        : null;
    const onClick = (e: MouseEvent) => {
      if (!latest.current.editing || move) return;
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t.closest(INTERACTIVE)) return;
      const frame = t.closest<HTMLElement>("[data-column] > [data-element-id]");
      select(frame?.dataset.elementId ?? null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!latest.current.editing) return;
      if (move?.via === "keyboard") return onMoveKey(e);
      if (move) return;
      const id = blockOf(e.target);
      const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
      if (e.key === "Escape" && selection.get() && !isEditable(e.target)) return select(null);
      if (!id || !plain) return;
      if (e.key === "Enter") select(id);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        if (allowed(id, "remove")) remove(id, { focusNext: true });
        else announce("Este bloco não pode ser apagado agora.");
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        e.stopPropagation();
        enterMoveMode(id);
      }
    };
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== "z" && e.key !== "Z") || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey)
        return;
      if (isEditable(e.target) || !latest.current.editing?.outbox.held()) return;
      e.preventDefault();
      undo();
    };
    const onPointerDownAnywhere = () => {
      if (move?.via === "keyboard") end(false);
    };

    const attach = () => {
      const vp = viewportRef.current;
      if (!vp) return () => undefined;
      vp.addEventListener("click", onClick);
      vp.addEventListener("keydown", onKeyDown, true);
      vp.addEventListener("pointerdown", onPointerDownAnywhere, true);
      window.addEventListener("keydown", onWindowKeyDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      return () => {
        end(false);
        vp.removeEventListener("click", onClick);
        vp.removeEventListener("keydown", onKeyDown, true);
        vp.removeEventListener("pointerdown", onPointerDownAnywhere, true);
        window.removeEventListener("keydown", onWindowKeyDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };
    };

    const api: BoardEditor & { attach(): () => void } = {
      selection,
      camera: { subscribe: (l) => latest.current.camera.subscribe(l) },
      flip,
      permissions,
      remove,
      undo,
      startDrag,
      enterMoveMode,
      attach,
    };
    return api;
  }, [store, writer, viewportRef, worldRef]);

  useEffect(() => editor.attach(), [editor]);

  return { editor, dragging, announcement, barRef, ghostRef };
}
