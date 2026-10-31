// Pure parts of the live handwriting (text written by a pen, circles and marker sweeps drawn after it): which
// changes animate, in what order, the glyph order of rendered HTML and the writing schedule. No layout here
// (jsdom-testable); measuring and the rAF loop live in writer.ts.
import type { BoardState, ElementState } from "../store";

/** Writing speed (characters per second) and the per-element bounds. */
export const WRITE_CPS = 45;
export const MIN_WRITE_MS = 600;
export const MAX_WRITE_MS = 2500;
/** Pen travel between two lines (an arc), counted inside the per-element cap. */
export const LINE_BREAK_MS = 180;
/** A new board action makes the element being written finish within this. */
export const HURRY_MS = 300;
/** Circles start this long after their target is written, and take this long. */
export const CIRCLE_DELAY_MS = 150;
export const CIRCLE_MS = 700;
/** Marker: one sweep per line, with a short gap between lines. */
export const MARK_LINE_MS = 280;
export const MARK_GAP_MS = 60;

export type WriteJob =
  | {
      kind: "write";
      id: string;
      /** The element before this change (update): its text is kept, not rewritten. */ from: ElementState | null;
    }
  | { kind: "circle"; id: string; action_id: string }
  | { kind: "mark"; id: string; action_id: string };

const WRITABLE = new Set<ElementState["type"]>(["text", "timeline", "question"]);

/**
 * What a store change should animate, in order: new or changed tutor text (write), then new circles and
 * highlights on it. `instant` changes (session restore) animate nothing.
 */
export function planJobs(
  prev: BoardState,
  next: BoardState,
  opts: { instant?: boolean } = {},
): WriteJob[] {
  if (opts.instant) return [];
  const jobs: WriteJob[] = [];
  for (const [id, el] of next.elements) {
    const before = prev.elements.get(id);
    if (before === el) continue;
    if (el.author === "tutor" && WRITABLE.has(el.type) && (!before || before.data !== el.data)) {
      jobs.push({ kind: "write", id, from: before && before.type === el.type ? before : null });
    }
    const seen = new Set(before?.annotations.map((a) => a.action_id));
    for (const a of el.annotations) {
      if (seen.has(a.action_id)) continue;
      jobs.push({ kind: a.kind === "circle" ? "circle" : "mark", id, action_id: a.action_id });
    }
  }
  return jobs;
}

// --- Glyphs

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" })
    : null;

/** User-perceived characters (a base letter and its combining accent are one). */
export function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

const isBlank = (g: string) => /^\s+$/u.test(g);

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "UL", "OL", "LI", "BR"]);
/** Nearest block-level ancestor inside `root` (a new block starts a new word even without whitespace). */
function blockOf(node: Node, root: Node): Node {
  for (let el = node.parentNode; el && el !== root; el = el.parentNode)
    if (BLOCK_TAGS.has(el.nodeName)) return el;
  return root;
}

export interface Glyph {
  node: Text;
  /** UTF-16 offsets of the grapheme inside `node`. */
  start: number;
  end: number;
  text: string;
  /** Whitespace came before it (a word starts here). */
  wordStart: boolean;
}

/** Every visible grapheme under `root`, in reading (DOM) order across nested tags; whitespace is skipped. */
export function collectGlyphs(root: Node): Glyph[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const out: Glyph[] = [];
  let gap = true;
  let block: Node | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const b = blockOf(node, root);
    if (b !== block) gap = true;
    block = b;
    let offset = 0;
    for (const g of graphemes(node.data)) {
      const start = offset;
      offset += g.length;
      if (isBlank(g)) {
        gap = true;
        continue;
      }
      out.push({ node, start, end: offset, text: g, wordStart: gap });
      gap = false;
    }
  }
  return out;
}

/** Non-blank graphemes of a plain string (to compare old and new text on update). */
export const textGlyphs = (text: string): string[] => graphemes(text).filter((g) => !isBlank(g));

/** How many leading items two sequences share. */
export function sharedPrefix(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// --- Schedule

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Writing time for `chars` characters, without line breaks: chars / 45 s within [0.6 s, 2.5 s]. */
export const writeDuration = (chars: number) =>
  chars <= 0 ? 0 : clamp((chars / WRITE_CPS) * 1000, MIN_WRITE_MS, MAX_WRITE_MS);

/** Small deterministic PRNG (mulberry32), so a block always writes with the same rhythm. */
function random(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScheduleItem {
  /** The glyph is the first of a new visual line (the pen travels an arc before it). */
  lineStart: boolean;
  wordStart: boolean;
}

export interface Slot {
  start: number;
  end: number;
}

/**
 * When each glyph is written (ms from the start): glyph time is writeDuration(n), shared with a little jitter and
 * a longer stroke at word starts; every line break adds a pen arc. The total never exceeds MAX_WRITE_MS: long
 * blocks speed up and shorten the arcs.
 */
export function writeSchedule(items: readonly ScheduleItem[], seed = 1): Slot[] {
  const n = items.length;
  if (n === 0) return [];
  const breaks = items.reduce((k, it, i) => k + (i > 0 && it.lineStart ? 1 : 0), 0);
  let breakMs = LINE_BREAK_MS;
  let glyphMs = writeDuration(n);
  if (glyphMs + breaks * breakMs > MAX_WRITE_MS) {
    breakMs = Math.min(breakMs, (MAX_WRITE_MS * 0.3) / Math.max(1, breaks));
    glyphMs = MAX_WRITE_MS - breaks * breakMs;
  }
  const rnd = random(seed);
  const weights = items.map((it) => 1 + (rnd() - 0.5) * 0.5 + (it.wordStart ? 0.4 : 0));
  const unit = glyphMs / weights.reduce((s, w) => s + w, 0);
  const slots: Slot[] = [];
  let t = 0;
  items.forEach((it, i) => {
    if (i > 0 && it.lineStart) t += breakMs;
    const start = t;
    t += (weights[i] as number) * unit;
    slots.push({ start, end: t });
  });
  return slots;
}

// --- Layout helpers (pure geometry; rects come from the DOM)

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Groups rects (in reading order) into visual lines: a rect starts a new line when it sits mostly below the current one. */
export function groupLines(rects: readonly Box[]): { lines: Box[]; lineOf: number[] } {
  const lines: Box[] = [];
  const lineOf: number[] = [];
  let cur: Box | undefined;
  for (const r of rects) {
    if (!cur || r.top >= cur.top + (cur.bottom - cur.top) * 0.6 || r.bottom <= cur.top) {
      cur = { ...r };
      lines.push(cur);
    } else {
      cur.top = Math.min(cur.top, r.top);
      cur.bottom = Math.max(cur.bottom, r.bottom);
      cur.left = Math.min(cur.left, r.left);
      cur.right = Math.max(cur.right, r.right);
    }
    lineOf.push(lines.length - 1);
  }
  return { lines, lineOf };
}

/** Horizontal cuts between lines: edges[i] is the top of line i's band, edges[n] the bottom of the last one. */
export function lineEdges(lines: readonly Box[]): number[] {
  if (lines.length === 0) return [];
  const edges = [(lines[0] as Box).top - 4];
  for (let i = 1; i < lines.length; i++) {
    const a = (lines[i - 1] as Box).bottom;
    const b = (lines[i] as Box).top;
    edges.push(b < a ? (a + b) / 2 : Math.min(a + 4, b));
  }
  edges.push((lines[lines.length - 1] as Box).bottom + 8);
  return edges;
}

/** Room around the content the clip never cuts (list markers, timeline dots, glyph overhang). */
const BLEED = 64;

/**
 * The reveal clip: everything above line `line` plus that line up to `x` (element-local px). A staircase, so
 * text is uncovered in reading order whatever the HTML structure.
 */
export function revealClip(
  edges: readonly number[],
  line: number,
  x: number,
  width: number,
): string {
  const top = edges[line] ?? 0;
  const bottom = edges[line + 1] ?? top;
  const p = (a: number, b: number) => `${a.toFixed(1)}px ${b.toFixed(1)}px`;
  const l = -BLEED;
  const r = width + BLEED;
  return `polygon(${p(l, -BLEED)}, ${p(r, -BLEED)}, ${p(r, top)}, ${p(x, top)}, ${p(x, bottom)}, ${p(l, bottom)})`;
}

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of t in [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bez(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return bez((lo + hi) / 2, y1, y2);
  };
}

// --- Write queue

export interface WriteQueue<J> {
  push(job: J): void;
  /** Ends the running job now and completes every queued one, in order. */
  flush(): void;
  /** Jobs not started yet. */
  queued(): readonly J[];
  current(): J | null;
  busy(): boolean;
}

/**
 * Runs jobs one at a time, in push order. `run` animates a job and resolves when done (it must resolve promptly
 * when its signal aborts); `complete` then applies the final state, also for jobs flushed before they ran.
 */
export function createWriteQueue<J>(opts: {
  run(job: J, signal: AbortSignal): Promise<void>;
  complete(job: J): void;
  onBusyChange?(busy: boolean): void;
}): WriteQueue<J> {
  const jobs: J[] = [];
  let current: { job: J; ac: AbortController } | null = null;
  let wasBusy = false;
  const notify = () => {
    const b = current !== null || jobs.length > 0;
    if (b === wasBusy) return;
    wasBusy = b;
    opts.onBusyChange?.(b);
  };
  const next = () => {
    if (current) return;
    const job = jobs.shift();
    if (job === undefined) return notify();
    const run = { job, ac: new AbortController() };
    current = run;
    const done = () => {
      if (current !== run) return;
      current = null;
      opts.complete(job);
      next();
    };
    opts.run(job, run.ac.signal).then(done, done);
  };
  return {
    push(job) {
      jobs.push(job);
      notify();
      next();
    },
    flush() {
      const run = current;
      current = null;
      if (run) {
        run.ac.abort();
        opts.complete(run.job);
      }
      for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) opts.complete(job);
      notify();
    },
    queued: () => jobs,
    current: () => current?.job ?? null,
    busy: () => current !== null || jobs.length > 0,
  };
}
