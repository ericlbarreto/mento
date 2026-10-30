import { describe, expect, it } from "vitest";
import {
  ORB_STATES,
  clampLevel,
  orbFace,
  orbFaceSrc,
  orbRingMode,
  orbStateLabels,
  ringPath,
  smoothLevel,
} from "./orbModel";

describe("orbFace", () => {
  it("maps each state to its mascot face (docs/19 §4)", () => {
    expect(orbFace("idle")).toBe("float");
    expect(orbFace("listening")).toBe("float");
    expect(orbFace("waiting")).toBe("float");
    expect(orbFace("thinking")).toBe("thinking");
    expect(orbFace("speaking")).toBe("speaking");
    expect(orbFace("loading")).toBe("spin");
    expect(orbFace("paused")).toBe("static");
  });

  it("uses the static mascot for every state under reduced motion", () => {
    for (const s of ORB_STATES) expect(orbFace(s, true)).toBe("static");
  });
});

describe("orbFaceSrc", () => {
  it("builds the public asset paths", () => {
    expect(orbFaceSrc("float")).toBe("/brand/mascot/float.gif");
    expect(orbFaceSrc("spin", "/assets/")).toBe("/assets/mascot/spin.gif");
    expect(orbFaceSrc("static")).toBe("/brand/mascot.png");
  });
});

describe("labels and ring modes", () => {
  it("has a pt-BR label and a ring mode for every state", () => {
    for (const s of ORB_STATES) {
      expect(orbStateLabels[s]).toMatch(/^Mento está /);
      expect(orbRingMode(s)).toBeTruthy();
    }
    expect(orbStateLabels.listening).toBe("Mento está ouvindo");
    expect(orbRingMode("speaking")).toBe("level");
    expect(orbRingMode("paused")).toBe("dim");
  });
});

describe("levels", () => {
  it("clamps to 0..1 and drops non-finite values", () => {
    expect(clampLevel(-1)).toBe(0);
    expect(clampLevel(2)).toBe(1);
    expect(clampLevel(Number.NaN)).toBe(0);
    expect(clampLevel(0.4)).toBe(0.4);
  });

  it("rises faster than it falls", () => {
    const up = smoothLevel(0, 1, 16);
    const down = 1 - smoothLevel(1, 0, 16);
    expect(up).toBeGreaterThan(down);
    expect(smoothLevel(0.3, 0.3, 16)).toBeCloseTo(0.3);
    expect(smoothLevel(0, 1, 10_000)).toBeCloseTo(1);
  });
});

describe("ringPath", () => {
  it("is a closed path with one point per sample", () => {
    const d = ringPath(100, 100, 80, 0, 5, 0, 12);
    expect(d.startsWith("M180.00 100.00")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/[ML]/g)).toHaveLength(12);
  });

  it("stays within r ± amp", () => {
    const d = ringPath(0, 0, 80, 6, 7, 1.3);
    const nums = d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      const r = Math.hypot(nums[i]!, nums[i + 1]!);
      expect(r).toBeGreaterThanOrEqual(74 - 0.01);
      expect(r).toBeLessThanOrEqual(86 + 0.01);
    }
  });
});
