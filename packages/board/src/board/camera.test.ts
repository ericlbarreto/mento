import { describe, expect, it } from "vitest";
import {
  BOUNDS_MARGIN_PX,
  MAX_SCALE,
  MIN_SCALE,
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

const viewport = { w: 1000, h: 600 };
const inset = { top: 20, right: 20, bottom: 100, left: 20 };

describe("clampScale", () => {
  it("keeps the zoom between 0.5 and 1.5", () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE);
    expect(clampScale(3)).toBe(MAX_SCALE);
    expect(clampScale(1.2)).toBe(1.2);
  });
});

describe("exceedsDragThreshold", () => {
  it("treats moves under 4 px as a click", () => {
    expect(exceedsDragThreshold(2, 2)).toBe(false);
    expect(exceedsDragThreshold(3, 0)).toBe(false);
    expect(exceedsDragThreshold(4, 0)).toBe(true);
    expect(exceedsDragThreshold(-3, -3)).toBe(true);
  });
});

describe("zoomAt", () => {
  it("keeps the world point under the pointer fixed", () => {
    const cam = { x: 100, y: 50, scale: 1 };
    const next = zoomAt(cam, 1.25, 400, 300);
    const worldX = (400 - cam.x) / cam.scale;
    const worldY = (300 - cam.y) / cam.scale;
    expect(worldX * next.scale + next.x).toBeCloseTo(400);
    expect(worldY * next.scale + next.y).toBeCloseTo(300);
    expect(next.scale).toBe(1.25);
  });

  it("clamps the scale and still keeps the anchor", () => {
    const next = zoomAt({ x: 0, y: 0, scale: 1.4 }, 2, 200, 200);
    expect(next.scale).toBe(MAX_SCALE);
    expect(((200 - 0) / 1.4) * next.scale + next.x).toBeCloseTo(200);
  });
});

describe("clampCamera", () => {
  const world = { w: 2000, h: 3000 };

  it("leaves a camera inside the bounds alone", () => {
    const cam = { x: -300, y: -800, scale: 1 };
    expect(clampCamera(cam, viewport, world)).toEqual(cam);
  });

  it("keeps a strip of the world visible on every side", () => {
    expect(clampCamera({ x: 5000, y: 5000, scale: 1 }, viewport, world)).toEqual({
      x: viewport.w - BOUNDS_MARGIN_PX,
      y: viewport.h - BOUNDS_MARGIN_PX,
      scale: 1,
    });
    expect(clampCamera({ x: -9000, y: -9000, scale: 1 }, viewport, world)).toEqual({
      x: BOUNDS_MARGIN_PX - 2000,
      y: BOUNDS_MARGIN_PX - 3000,
      scale: 1,
    });
  });

  it("keeps a world smaller than the margin fully visible", () => {
    const small = { w: 100, h: 80 };
    expect(clampCamera({ x: -500, y: 900, scale: 1 }, viewport, small)).toEqual({ x: 0, y: viewport.h - 80, scale: 1 });
  });

  it("accounts for the zoom", () => {
    const next = clampCamera({ x: -9000, y: 0, scale: 0.5 }, viewport, world);
    expect(next.x).toBe(BOUNDS_MARGIN_PX - 1000);
  });
});

describe("followTarget", () => {
  const cam = { x: 0, y: 0, scale: 1 };

  it("returns null when the element is already visible", () => {
    expect(followTarget(cam, viewport, { x: 100, y: 100, w: 300, h: 200 }, inset)).toBeNull();
  });

  it("moves just enough to show an element below the fold, above the bottom inset", () => {
    const next = followTarget(cam, viewport, { x: 100, y: 700, w: 300, h: 100 }, inset);
    // Element bottom (800) lands at viewport.h - inset.bottom (500).
    expect(next).toEqual({ x: 0, y: -300, scale: 1 });
  });

  it("aligns the top of an element taller than the room", () => {
    const next = followTarget(cam, viewport, { x: 100, y: 900, w: 300, h: 2000 }, inset);
    expect(next?.y).toBe(inset.top - 900);
  });

  it("brings in an element off to the right and works at any zoom", () => {
    const next = followTarget({ x: 0, y: 0, scale: 0.5 }, viewport, { x: 2400, y: 100, w: 400, h: 100 }, inset);
    // Right edge at 0.5 * 2800 = 1400 → moved to 980.
    expect(next).toEqual({ x: -420, y: 0, scale: 0.5 });
  });

  it("brings back an element scrolled past the top-left", () => {
    const next = followTarget({ x: -500, y: -500, scale: 1 }, viewport, { x: 100, y: 100, w: 100, h: 100 }, inset);
    expect(next).toEqual({ x: inset.left - 100, y: inset.top - 100, scale: 1 });
  });
});

describe("centerOn", () => {
  it("centers a rect in the inset room", () => {
    const cam = centerOn(1, viewport, { x: 1000, y: 1000, w: 200, h: 100 }, inset);
    // Room: x 20..980 (center 500), y 20..500 (center 260).
    expect(1000 + cam.x + 100).toBe(500);
    expect(1000 + cam.y + 50).toBe(260);
  });

  it("aligns a tall rect to the top", () => {
    const cam = centerOn(1, viewport, { x: 0, y: 1000, w: 200, h: 900 }, inset);
    expect(cam.y).toBe(inset.top - 1000);
  });
});

describe("initialCamera", () => {
  it("starts at the main column origin at scale 1", () => {
    expect(initialCamera(viewport, 744)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("fits the main column on a narrow screen", () => {
    expect(initialCamera({ w: 372, h: 700 }, 744).scale).toBe(0.5);
    expect(initialCamera({ w: 100, h: 700 }, 744).scale).toBe(MIN_SCALE);
  });
});

describe("animation helpers", () => {
  it("eases out from 0 to 1 and clamps", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("interpolates cameras", () => {
    expect(lerpCamera({ x: 0, y: 0, scale: 1 }, { x: 100, y: -50, scale: 1.5 }, 0.5)).toEqual({
      x: 50,
      y: -25,
      scale: 1.25,
    });
  });

  it("decays inertia and eventually stops", () => {
    let v = { vx: 2, vy: 0 };
    let travelled = 0;
    let frames = 0;
    while (isMoving(v.vx, v.vy) && frames < 1000) {
      const step = inertiaStep(v.vx, v.vy, 16);
      travelled += step.dx;
      v = step;
      frames++;
    }
    expect(frames).toBeLessThan(1000);
    // Total distance tends to v0 * tau.
    expect(travelled).toBeGreaterThan(500);
    expect(travelled).toBeLessThan(2 * 325);
  });

  it("zooms in on a negative wheel delta and bounds a mouse notch", () => {
    expect(wheelZoomFactor(-10)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10)).toBeLessThan(1);
    expect(wheelZoomFactor(1000)).toBe(wheelZoomFactor(50));
  });
});
