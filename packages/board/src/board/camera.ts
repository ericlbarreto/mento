// Pure camera math for the canvas board: screen = world * scale + (x, y). No DOM here, so it is unit-tested.

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  w: number;
  h: number;
}

/** A rectangle in world coordinates (unscaled board pixels). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room kept clear around a followed element (screen pixels); bottom leaves space for the board's overlays. */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.5;
/** A press that moves less than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;
/** At least this much of the world stays on screen (or the whole world, when smaller). */
export const BOUNDS_MARGIN_PX = 160;
/** Inertia: velocity decays as exp(-dt / tau); it stops below the minimum speed (px/ms). */
export const INERTIA_TAU_MS = 325;
export const INERTIA_MIN_SPEED = 0.02;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const clampScale = (scale: number) => clamp(scale, MIN_SCALE, MAX_SCALE);

export const exceedsDragThreshold = (dx: number, dy: number, threshold = DRAG_THRESHOLD_PX) =>
  dx * dx + dy * dy >= threshold * threshold;

/** Zooms by `factor` keeping the world point under the screen point (px, py) fixed. */
export function zoomAt(cam: Camera, factor: number, px: number, py: number): Camera {
  const scale = clampScale(cam.scale * factor);
  const k = scale / cam.scale;
  return { scale, x: px - (px - cam.x) * k, y: py - (py - cam.y) * k };
}

/** Soft bounds: the world can move almost off screen, but a strip of it always stays visible. */
export function clampCamera(cam: Camera, viewport: Size, world: Size, margin = BOUNDS_MARGIN_PX): Camera {
  const axis = (pos: number, view: number, size: number) => {
    const scaled = size * cam.scale;
    const m = Math.min(margin, scaled, view);
    return clamp(pos, m - scaled, view - m);
  };
  return { scale: cam.scale, x: axis(cam.x, viewport.w, world.w), y: axis(cam.y, viewport.h, world.h) };
}

/**
 * Where the camera must go so `rect` is visible inside the inset viewport, moving as little as possible
 * (like scrollIntoView "nearest"). Too big to fit: align its start. Null when it is already visible.
 */
export function followTarget(cam: Camera, viewport: Size, rect: Rect, inset: Inset): Camera | null {
  const axis = (pos: number, start: number, size: number, view: number, before: number, after: number) => {
    const s = start * cam.scale + pos;
    const e = s + size * cam.scale;
    const lo = before;
    const hi = view - after;
    if (e - s > hi - lo) return pos + (lo - s);
    if (s < lo) return pos + (lo - s);
    if (e > hi) return pos - (e - hi);
    return pos;
  };
  const x = axis(cam.x, rect.x, rect.w, viewport.w, inset.left, inset.right);
  const y = axis(cam.y, rect.y, rect.h, viewport.h, inset.top, inset.bottom);
  if (Math.abs(x - cam.x) < 0.5 && Math.abs(y - cam.y) < 0.5) return null;
  return { scale: cam.scale, x, y };
}

/** Centers `rect` in the inset viewport at `scale`; a rect taller than the room is aligned to its top. */
export function centerOn(scale: number, viewport: Size, rect: Rect, inset: Inset): Camera {
  const axis = (start: number, size: number, view: number, before: number, after: number) => {
    const room = view - before - after;
    const scaled = size * scale;
    const offset = scaled > room ? before : before + (room - scaled) / 2;
    return offset - start * scale;
  };
  return {
    scale,
    x: axis(rect.x, rect.w, viewport.w, inset.left, inset.right),
    y: axis(rect.y, rect.h, viewport.h, inset.top, inset.bottom),
  };
}

/** First view: the start of the main column at scale 1, or scaled down so the column fits a narrow screen. */
export function initialCamera(viewport: Size, mainWidth: number): Camera {
  const scale = viewport.w > 0 && viewport.w < mainWidth ? clampScale(viewport.w / mainWidth) : 1;
  return { x: 0, y: 0, scale };
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export const lerpCamera = (a: Camera, b: Camera, t: number): Camera => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  scale: a.scale + (b.scale - a.scale) * t,
});

/** One inertia step: the distance moved during `dt` ms and the decayed velocity (px/ms). */
export function inertiaStep(vx: number, vy: number, dt: number, tau = INERTIA_TAU_MS) {
  const k = Math.exp(-dt / tau);
  // Exact integral of v * exp(-t / tau) over [0, dt].
  const travel = tau * (1 - k);
  return { dx: vx * travel, dy: vy * travel, vx: vx * k, vy: vy * k };
}

export const isMoving = (vx: number, vy: number, min = INERTIA_MIN_SPEED) => Math.hypot(vx, vy) >= min;

/** Mouse wheel zoom: ctrl/⌘ + wheel and trackpad pinch both arrive as ctrl+wheel deltas. */
export const wheelZoomFactor = (deltaY: number) => Math.exp(-clamp(deltaY, -50, 50) * 0.01);
