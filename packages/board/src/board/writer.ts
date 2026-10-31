// The board's handwriting driver: one per board. It turns live store changes into a queue of pen jobs (write a
// block, draw a circle, sweep a marker) and plays them one after another with rAF and direct DOM writes (a
// clip-path on the text, a transform on the pen): no React render per character. Restored boards, elements on
// the board at mount and reduced motion skip it (everything appears at once).
import type { BoardStore, ElementState } from "../store";
import type { Rect } from "./camera";
import {
  CIRCLE_DELAY_MS,
  CIRCLE_MS,
  HURRY_MS,
  MARK_GAP_MS,
  MARK_LINE_MS,
  type Box,
  type Slot,
  type WriteJob,
  collectGlyphs,
  createWriteQueue,
  cubicBezier,
  groupLines,
  lineEdges,
  planJobs,
  revealClip,
  sharedPrefix,
  textGlyphs,
  writeSchedule,
} from "./handwriting";

export interface Focus {
  id: string;
  /** World rect to keep in view (the caret's line); absent = the whole element. */
  rect?: Rect;
}

export interface BoardWriter {
  /** Starts listening to the store (baseline = what is on the board now). Returns the detach. */
  attach(world: HTMLElement, pen: HTMLElement): () => void;
  /** ElementFrame registers its content after each data change (layout effect, before paint). */
  mount(id: string, content: HTMLElement, data: unknown): () => void;
  /** A circle/highlight still waiting for the pen (render it undrawn). */
  isMarkPending(action_id: string): boolean;
  /** The element has a job that has not started yet (the camera does not jump to it). */
  isQueued(id: string): boolean;
  /** Finish everything now (the student touched a writing element). */
  finishAll(): void;
  isWriting(id: string): boolean;
  subscribeFocus(listener: (focus: Focus) => void): () => void;
}

/** Pen size at scale 1 and its on-screen bounds. */
const PEN_PX = 28;
const PEN_MIN_PX = 22;
const PEN_MAX_PX = 36;
const PEN_LERP = 0.35;
const PEN_MAX_LAG = 6;
const PEN_IDLE_MS = 600;
/** Give up waiting for an element / circle to render after this many frames. */
const MAX_WAIT_FRAMES = 90;

const easeCircle = cubicBezier(0.45, 0, 0.25, 1);
const easeMark = cubicBezier(0.65, 0, 0.35, 1);

interface Mounted {
  content: HTMLElement;
  /** The part that is written (content, or a [data-board-write] inside it, e.g. the question text). */
  target: HTMLElement;
  frame: HTMLElement;
  data: unknown;
}

interface Plan {
  lines: Box[];
  edges: number[];
  glyphs: { line: number; left: number; right: number }[];
  /** First glyph to write (the kept prefix of an update). */
  from: number;
  slots: Slot[];
  width: number;
}

type Point = { x: number; y: number };

/** Plain text of an element as it was before an update (to keep the unchanged prefix). */
function plainText(el: ElementState | null): string {
  if (!el) return "";
  switch (el.type) {
    case "text": {
      // DOMParser documents are inert: no scripts run, no images load.
      const doc = new DOMParser().parseFromString(el.data.html, "text/html");
      return doc.body.textContent ?? "";
    }
    case "timeline":
      return el.data.events.map((e) => `${e.date} ${e.label}`).join(" ");
    case "question":
      return el.data.question;
    default:
      return "";
  }
}

const seedOf = (id: string) => {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
};

/** Scale of the world (canvas zoom) and an element's origin in world coordinates. */
function worldOrigin(world: HTMLElement, el: Element): { x: number; y: number; scale: number } {
  const w = world.getBoundingClientRect();
  const scale = world.offsetWidth > 0 ? w.width / world.offsetWidth : 1;
  const r = el.getBoundingClientRect();
  return { x: (r.left - w.left) / scale, y: (r.top - w.top) / scale, scale };
}

function measurePlan(target: HTMLElement, fromText: string, seed: number): Plan | null {
  const glyphs = collectGlyphs(target);
  const t = target.getBoundingClientRect();
  const scale = target.offsetWidth > 0 ? t.width / target.offsetWidth : 1;
  const range = target.ownerDocument.createRange();
  const rects: Box[] = [];
  const texts: string[] = [];
  const words: boolean[] = [];
  for (const g of glyphs) {
    range.setStart(g.node, g.start);
    range.setEnd(g.node, g.end);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    rects.push({
      top: (r.top - t.top) / scale,
      bottom: (r.bottom - t.top) / scale,
      left: (r.left - t.left) / scale,
      right: (r.right - t.left) / scale,
    });
    texts.push(g.text);
    words.push(g.wordStart);
  }
  if (rects.length === 0) return null;
  const { lines, lineOf } = groupLines(rects);
  const from = sharedPrefix(textGlyphs(fromText), texts);
  const kept = rects.map((r, i) => ({ line: lineOf[i] as number, left: r.left, right: r.right }));
  const rest = kept.slice(from).map((g, i) => ({
    lineStart: i > 0 && g.line !== (kept[from + i - 1] as { line: number }).line,
    wordStart: words[from + i] === true,
  }));
  return {
    lines,
    edges: lineEdges(lines),
    glyphs: kept,
    from,
    slots: writeSchedule(rest, seed),
    width: target.offsetWidth,
  };
}

/** Clip showing glyphs [0, count) fully; null = everything visible. */
function clipAt(plan: Plan, count: number, partialX?: number): string | null {
  if (count >= plan.glyphs.length && partialX === undefined) return null;
  if (count <= 0 && partialX === undefined) return revealClip(plan.edges, 0, -64, plan.width);
  const g = plan.glyphs[partialX === undefined ? count - 1 : count] as Plan["glyphs"][number];
  return revealClip(plan.edges, g.line, partialX ?? g.right, plan.width);
}

/** The job clock: elapsed ms that stops while paused and can be sped up (catch-up when new actions arrive). */
class Clock {
  t = 0;
  rate = 1;
  private last = performance.now();
  constructor(private paused: () => boolean) {}
  tick(now: number) {
    const dt = Math.max(0, now - this.last);
    this.last = now;
    if (!this.paused()) this.t += dt * this.rate;
    return this.t;
  }
  /** Finish what is left of `total` within HURRY_MS. */
  hurry(total: number) {
    const left = total - this.t;
    if (left > HURRY_MS) this.rate = Math.max(this.rate, left / HURRY_MS);
  }
}

export function createBoardWriter(store: BoardStore): BoardWriter {
  const writes = new Map<string, number>();
  const started = new Set<string>();
  const marks = new Set<string>();
  const mounted = new Map<string, Mounted>();
  const focusListeners = new Set<(f: Focus) => void>();
  let world: HTMLElement | null = null;
  let pen: HTMLElement | null = null;
  let current: { clock: Clock; total: number } | null = null;

  const reduced = () =>
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const focus = (f: Focus) => focusListeners.forEach((l) => l(f));

  // --- Pen: smoothed towards its target each frame; fades only after the whole queue has been idle a while.
  let penPos: Point | null = null;
  let penTimer: ReturnType<typeof setTimeout> | undefined;
  const penTo = (target: Point, scale: number) => {
    if (!pen) return;
    clearTimeout(penTimer);
    if (!penPos) penPos = { ...target };
    else {
      penPos.x += (target.x - penPos.x) * PEN_LERP;
      penPos.y += (target.y - penPos.y) * PEN_LERP;
      const dx = target.x - penPos.x;
      const dy = target.y - penPos.y;
      const lag = Math.hypot(dx, dy);
      const max = PEN_MAX_LAG / scale;
      if (lag > max) {
        penPos.x = target.x - (dx / lag) * max;
        penPos.y = target.y - (dy / lag) * max;
      }
    }
    // Keep the pen 22–36 px on screen whatever the zoom.
    const screen = Math.min(PEN_MAX_PX, Math.max(PEN_MIN_PX, PEN_PX * scale));
    const k = screen / (PEN_PX * scale);
    pen.style.transform = `translate3d(${penPos.x.toFixed(1)}px, ${penPos.y.toFixed(1)}px, 0) scale(${k.toFixed(3)})`;
    pen.style.opacity = "1";
  };
  const penIdle = (now = false) => {
    clearTimeout(penTimer);
    const hide = () => {
      if (pen) pen.style.opacity = "0";
      penPos = null;
    };
    if (now) hide();
    else penTimer = setTimeout(hide, PEN_IDLE_MS);
  };

  /** rAF loop on the job clock until `frame` returns false or the signal aborts. */
  const loop = (signal: AbortSignal, total: number, frame: (t: number) => boolean) =>
    new Promise<void>((resolve) => {
      const clock = new Clock(() => store.animation.isPaused());
      current = { clock, total };
      let raf = 0;
      const end = () => {
        cancelAnimationFrame(raf);
        signal.removeEventListener("abort", end);
        if (current?.clock === clock) current = null;
        resolve();
      };
      signal.addEventListener("abort", end);
      const step = (now: number) => {
        if (signal.aborted) return;
        const t = clock.tick(now);
        if (!frame(t)) return end();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });

  /** Resolves with the value once `get` returns one (checked each frame), or null. */
  const waitFor = <T>(signal: AbortSignal, get: () => T | null | undefined) =>
    new Promise<T | null>((resolve) => {
      let frames = 0;
      const step = () => {
        if (signal.aborted) return resolve(null);
        const v = get();
        if (v) return resolve(v);
        if (++frames > MAX_WAIT_FRAMES) return resolve(null);
        requestAnimationFrame(step);
      };
      step();
    });

  const delay = (signal: AbortSignal, ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
    });

  const currentMount = (id: string) => {
    const m = mounted.get(id);
    const el = store.getElement(id);
    return m && el && m.data === el.data && m.target.isConnected ? m : null;
  };

  // --- Jobs

  const runWrite = async (job: Extract<WriteJob, { kind: "write" }>, signal: AbortSignal) => {
    const m = await waitFor(signal, () => currentMount(job.id));
    if (!m || signal.aborted) return;
    if (document.fonts && document.fonts.status !== "loaded") {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => signal.addEventListener("abort", r, { once: true })),
      ]);
      if (signal.aborted || !currentMount(job.id)) return;
    }
    const fromText = plainText(job.from);
    const seed = seedOf(job.id);
    let plan = measurePlan(m.target, fromText, seed);
    if (!plan || plan.from >= plan.glyphs.length) return;
    started.add(job.id);
    // Show the frame with nothing written yet, in the same frame (no flash of the full text).
    m.target.style.clipPath = clipAt(plan, plan.from) ?? "";
    delete m.frame.dataset.queued;
    m.frame.dataset.writing = "";
    focus({ id: job.id });

    // The box is final from the start (hidden text keeps its space); re-measure only if it resizes.
    let dirty = false;
    const ro = new ResizeObserver(() => (dirty = true));
    ro.observe(m.target);
    let lastLine = -1;
    let i = 0;
    const total = () => plan?.slots[plan.slots.length - 1]?.end ?? 0;
    try {
      await loop(signal, total(), (t) => {
        if (!plan) return false;
        // An update replaced the content while writing: the next job writes it.
        if (mounted.get(job.id) !== m || !m.target.isConnected) return false;
        if (dirty) {
          dirty = false;
          plan = measurePlan(m.target, fromText, seed) ?? plan;
          if (current) current.total = total();
        }
        const slots = plan.slots;
        while (i < slots.length && (slots[i] as Slot).end <= t) i++;
        const o = worldOrigin(world as HTMLElement, m.target);
        const idx = plan.from + i;
        if (i >= slots.length) {
          m.target.style.clipPath = "";
          return false;
        }
        const slot = slots[i] as Slot;
        const g = plan.glyphs[idx] as Plan["glyphs"][number];
        const line = plan.lines[g.line] as Box;
        const baseline = line.bottom - (line.bottom - line.top) * 0.2;
        let tip: Point;
        if (t < slot.start) {
          // Between two lines: the previous glyph is done, the pen travels an arc to the next line.
          const prev = plan.glyphs[idx - 1];
          m.target.style.clipPath = clipAt(plan, idx) ?? "";
          const pl = prev ? (plan.lines[prev.line] as Box) : line;
          const a = { x: prev?.right ?? g.left, y: pl.bottom - (pl.bottom - pl.top) * 0.2 };
          const b = { x: g.left, y: baseline };
          const prevEnd = (slots[i - 1] as Slot | undefined)?.end ?? 0;
          const f = Math.min(1, Math.max(0, (t - prevEnd) / Math.max(1, slot.start - prevEnd)));
          const lift = 18;
          tip = {
            x: a.x + (b.x - a.x) * f,
            y: a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * lift,
          };
        } else {
          const f = Math.min(1, (t - slot.start) / Math.max(1, slot.end - slot.start));
          const x = g.left + (g.right - g.left) * f;
          m.target.style.clipPath = clipAt(plan, idx, x) ?? "";
          // A small vertical wobble, like a hand.
          tip = { x, y: baseline + Math.sin(t / 45) * 1.2 };
        }
        penTo({ x: o.x + tip.x, y: o.y + tip.y }, o.scale);
        if (g.line !== lastLine) {
          // Re-follow only when the caret's line leaves the safe area (the camera decides).
          if (lastLine !== -1)
            focus({
              id: job.id,
              rect: {
                x: o.x + line.left,
                y: o.y + line.top,
                w: line.right - line.left,
                h: line.bottom - line.top,
              },
            });
          lastLine = g.line;
        }
        return true;
      });
    } finally {
      ro.disconnect();
    }
  };

  const markFrame = (id: string) =>
    world ? world.querySelector(`[data-element-id="${CSS.escape(id)}"]`) : null;

  const runCircle = async (job: Extract<WriteJob, { kind: "circle" }>, signal: AbortSignal) => {
    const sel = `[data-circle-for="${CSS.escape(job.action_id)}"]`;
    const found = await waitFor(signal, () =>
      markFrame(job.id)?.querySelector<SVGPathElement>(sel),
    );
    if (!found || signal.aborted) return;
    await delay(signal, CIRCLE_DELAY_MS);
    if (signal.aborted) return;
    focus({ id: job.id });
    await loop(signal, CIRCLE_MS, (t) => {
      const path = markFrame(job.id)?.querySelector<SVGPathElement>(sel);
      const svg = path?.ownerSVGElement;
      if (!path || !svg || !world) return false;
      const p = easeCircle(Math.min(1, t / CIRCLE_MS));
      path.style.strokeDashoffset = String(1 - p);
      const pt = path.getPointAtLength(path.getTotalLength() * p);
      const o = worldOrigin(world, svg);
      penTo({ x: o.x + pt.x, y: o.y + pt.y }, o.scale);
      return t < CIRCLE_MS;
    });
  };

  const runMark = async (job: Extract<WriteJob, { kind: "mark" }>, signal: AbortSignal) => {
    const sel = `[data-mark-for="${CSS.escape(job.action_id)}"]`;
    const layer = await waitFor(signal, () => markFrame(job.id)?.querySelector<HTMLElement>(sel));
    if (!layer || signal.aborted) return;
    const count = layer.querySelectorAll("[data-mark-line]").length;
    if (count === 0) return;
    focus({ id: job.id });
    const per = MARK_LINE_MS + MARK_GAP_MS;
    const total = count * per - MARK_GAP_MS;
    await loop(signal, total, (t) => {
      const current = markFrame(job.id)?.querySelector<HTMLElement>(sel);
      const lines = current?.querySelectorAll<HTMLElement>("[data-mark-line]");
      if (!current || !lines || !world) return false;
      const active = Math.min(lines.length - 1, Math.floor(t / per));
      lines.forEach((line, k) => {
        const p = easeMark(Math.min(1, Math.max(0, (t - k * per) / MARK_LINE_MS)));
        line.style.transform = `skewY(-1deg) scaleX(${p.toFixed(3)})`;
        if (k !== active) return;
        const o = worldOrigin(world as HTMLElement, current);
        penTo(
          {
            x: o.x + line.offsetLeft + line.offsetWidth * p,
            y: o.y + line.offsetTop + line.offsetHeight * 0.75,
          },
          o.scale,
        );
      });
      return t < total;
    });
  };

  const complete = (job: WriteJob) => {
    if (job.kind === "write") {
      const left = (writes.get(job.id) ?? 1) - 1;
      if (left > 0) writes.set(job.id, left);
      else writes.delete(job.id);
      started.delete(job.id);
      const m = mounted.get(job.id);
      if (m && left === 0) {
        m.target.style.clipPath = "";
        delete m.frame.dataset.queued;
        delete m.frame.dataset.writing;
      }
      return;
    }
    marks.delete(job.action_id);
    const frame = markFrame(job.id);
    if (job.kind === "circle") {
      const path = frame?.querySelector<SVGPathElement>(
        `[data-circle-for="${CSS.escape(job.action_id)}"]`,
      );
      if (path) path.style.strokeDashoffset = "0";
    } else {
      frame
        ?.querySelector(`[data-mark-for="${CSS.escape(job.action_id)}"]`)
        ?.querySelectorAll<HTMLElement>("[data-mark-line]")
        .forEach((l) => (l.style.transform = "skewY(-1deg) scaleX(1)"));
    }
  };

  const queue = createWriteQueue<WriteJob>({
    run: (job, signal) =>
      job.kind === "write"
        ? runWrite(job, signal)
        : job.kind === "circle"
          ? runCircle(job, signal)
          : runMark(job, signal),
    complete,
    onBusyChange: (busy) => {
      store.animation.setBusy(busy);
      if (!busy) penIdle();
    },
  });

  const flush = () => {
    if (!queue.busy()) return;
    queue.flush();
    penIdle(true);
  };

  return {
    attach(w, p) {
      world = w;
      pen = p;
      let prev = store.getState();
      const unsubscribe = store.subscribe(() => {
        const next = store.getState();
        const jobs = reduced() ? [] : planJobs(prev, next, { instant: store.isInstant() });
        prev = next;
        if (next.elements.size === 0) return flush();
        if (jobs.length === 0) return;
        // Catch-up: the element being written finishes within HURRY_MS once something new arrives.
        current?.clock.hurry(current.total);
        for (const job of jobs) {
          if (job.kind === "write") {
            // A queued (not started) write of the same element will write the newest content anyway.
            const waiting = [...queue.queued(), ...(started.has(job.id) ? [] : [queue.current()])];
            if (waiting.some((q) => q?.kind === "write" && q.id === job.id)) continue;
            writes.set(job.id, (writes.get(job.id) ?? 0) + 1);
          } else marks.add(job.action_id);
          queue.push(job);
        }
      });
      const unsubscribeBus = store.animation.subscribe((s) => {
        if (s === "settle") flush();
      });
      const onVisibility = () => {
        if (document.visibilityState === "hidden") flush();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        unsubscribe();
        unsubscribeBus();
        document.removeEventListener("visibilitychange", onVisibility);
        flush();
        clearTimeout(penTimer);
        world = null;
        pen = null;
      };
    },

    mount(id, content, data) {
      const target = content.querySelector<HTMLElement>("[data-board-write]") ?? content;
      const frame = (content.closest("[data-element-id]") as HTMLElement | null) ?? content;
      const m: Mounted = { content, target, frame, data };
      mounted.set(id, m);
      if (writes.has(id)) {
        if (started.has(id)) {
          // New content while writing (update): keep what is already there until the next job writes the rest.
          const job = queue.queued().find((q) => q.kind === "write" && q.id === id) as
            Extract<WriteJob, { kind: "write" }> | undefined;
          const plan = measurePlan(
            target,
            plainText(job?.from ?? store.getElement(id) ?? null),
            seedOf(id),
          );
          target.style.clipPath = plan ? (clipAt(plan, plan.from) ?? "") : "";
        } else {
          const job = queue.queued().find((q) => q.kind === "write" && q.id === id) as
            Extract<WriteJob, { kind: "write" }> | undefined;
          if (job?.from) {
            // Update of a visible element: hide only the new part until the pen gets there.
            const plan = measurePlan(target, plainText(job.from), seedOf(id));
            target.style.clipPath = plan ? (clipAt(plan, plan.from) ?? "") : "";
          } else {
            // Not started: no empty frame on the board, and no flash of the full text.
            frame.dataset.queued = "";
            target.style.clipPath = "inset(0 0 100% 0)";
          }
          frame.dataset.writing = "";
        }
      }
      return () => {
        if (mounted.get(id) === m) mounted.delete(id);
      };
    },

    isMarkPending: (action_id) => marks.has(action_id),
    isQueued: (id) => queue.queued().some((q) => q.id === id) && !started.has(id),
    isWriting: (id) => writes.has(id),
    finishAll: flush,
    subscribeFocus(listener) {
      focusListeners.add(listener);
      return () => focusListeners.delete(listener);
    },
  };
}
