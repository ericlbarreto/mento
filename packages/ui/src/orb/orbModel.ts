// Pure orb logic (no React, no DOM): state → mascot face, labels, ring geometry and level smoothing.
// Kept separate from Orb.tsx so it is unit-testable without a DOM (docs/19-brand-assets.md §4).

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "waiting" | "paused" | "loading";

export const ORB_STATES: readonly OrbState[] = ["idle", "listening", "thinking", "speaking", "waiting", "paused", "loading"];

/** Mascot faces stacked inside the orb; "static" is mascot.png. */
export type OrbFace = "float" | "thinking" | "speaking" | "spin" | "static";

export const ORB_FACES: readonly OrbFace[] = ["float", "thinking", "speaking", "spin", "static"];

const faceByState: Record<OrbState, OrbFace> = {
  idle: "float",
  listening: "float",
  waiting: "float",
  thinking: "thinking",
  speaking: "speaking",
  loading: "spin",
  paused: "static",
};

/** Which face to show. Reduced motion always gets the static mascot. */
export function orbFace(state: OrbState, reducedMotion = false): OrbFace {
  return reducedMotion ? "static" : faceByState[state];
}

/** Public URL of a face asset, e.g. "/brand/mascot/float.gif" or "/brand/mascot.png". */
export function orbFaceSrc(face: OrbFace, basePath = "/brand"): string {
  const base = basePath.replace(/\/+$/, "");
  return face === "static" ? `${base}/mascot.png` : `${base}/mascot/${face}.gif`;
}

/** Screen-reader state announcements (pt-BR, product text). */
export const orbStateLabels: Record<OrbState, string> = {
  idle: "Mento está pronto",
  listening: "Mento está ouvindo",
  thinking: "Mento está pensando…",
  speaking: "Mento está falando",
  waiting: "Mento está esperando sua resposta",
  paused: "Mento está pausado",
  loading: "Mento está carregando",
};

/** How the ring behaves in each state. */
export type OrbRingMode = "breathe" | "level" | "arc" | "pulse" | "dim";

const ringByState: Record<OrbState, OrbRingMode> = {
  idle: "breathe",
  listening: "level",
  speaking: "level",
  thinking: "arc",
  loading: "arc",
  waiting: "pulse",
  paused: "dim",
};

export function orbRingMode(state: OrbState): OrbRingMode {
  return ringByState[state];
}

/** Clamps an audio level to 0..1; NaN and non-finite values become 0. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

/**
 * Frame-rate independent smoothing: rises fast (attack) and falls slower (release),
 * so the ring follows syllables without jitter.
 */
export function smoothLevel(prev: number, target: number, dtMs: number, attackMs = 45, releaseMs = 180): number {
  const next = clampLevel(target);
  const tau = next > prev ? attackMs : releaseMs;
  const alpha = 1 - Math.exp(-Math.max(0, dtMs) / tau);
  return prev + (next - prev) * alpha;
}

/**
 * Closed SVG path of a wobbly circle: radius r plus a travelling wave of amplitude `amp`.
 * amp = 0 yields a plain polygonal circle (used as the static ring).
 */
export function ringPath(cx: number, cy: number, r: number, amp: number, lobes: number, phase: number, points = 72): string {
  let d = "";
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2;
    // Two waves so the outline reads as a voice, not a gear.
    const wave = Math.sin(lobes * t + phase) * (0.6 + 0.4 * Math.sin(3 * t - phase * 0.7));
    const rr = r + amp * wave;
    const x = cx + rr * Math.cos(t);
    const y = cy + rr * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * Static ring look per state. It is the whole cue under reduced motion (no loop runs), so states stay
 * distinguishable without movement; with motion the loop animates on top of it.
 * line/glow are opacities 0..1, width is the line's stroke width in the 200-unit viewBox.
 */
export type OrbRingCue = { line: number; width: number; glow: number; arc: boolean; dashed: boolean };

const cueByState: Record<OrbState, OrbRingCue> = {
  idle: { line: 0.9, width: 3.5, glow: 0.25, arc: false, dashed: false },
  listening: { line: 1, width: 4.5, glow: 0.6, arc: false, dashed: false },
  speaking: { line: 1, width: 4.5, glow: 0.6, arc: false, dashed: false },
  thinking: { line: 0.3, width: 3, glow: 0, arc: true, dashed: false },
  waiting: { line: 1, width: 3.5, glow: 0.3, arc: false, dashed: true },
  paused: { line: 0.55, width: 3, glow: 0, arc: false, dashed: false },
  loading: { line: 0.35, width: 3, glow: 0, arc: true, dashed: false },
};

export function orbRingCue(state: OrbState): OrbRingCue {
  return cueByState[state];
}

/** Only these state changes are announced to screen readers (the rest would be noise mid-session). */
export function orbAnnounces(state: OrbState): boolean {
  return state === "thinking" || state === "speaking" || state === "waiting";
}
