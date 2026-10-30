// Image URL policy for `draw_result.url` (untrusted): http(s) only, and only from the asset origin.

/** Resolves `url` against `base`; returns null unless it is http(s) on exactly the base origin. */
export function resolveImageUrl(url: string, base: string): string | null {
  try {
    const origin = new URL(base).origin;
    const u = new URL(url, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin === origin ? u.href : null;
  } catch {
    return null;
  }
}

export const MAX_DRAW_SIDE = 2048;
const MAX_RATIO = 4;

/** Clamps model-provided max_dimensions: each side 1..2048, aspect ratio between 1:4 and 4:1. */
export function clampDimensions({ w, h }: { w: number; h: number }): { w: number; h: number } {
  let cw = Math.min(MAX_DRAW_SIDE, Math.max(1, Math.round(w) || 1));
  let ch = Math.min(MAX_DRAW_SIDE, Math.max(1, Math.round(h) || 1));
  if (cw / ch > MAX_RATIO) cw = ch * MAX_RATIO;
  if (ch / cw > MAX_RATIO) ch = cw * MAX_RATIO;
  return { w: Math.min(MAX_DRAW_SIDE, cw), h: Math.min(MAX_DRAW_SIDE, ch) };
}
