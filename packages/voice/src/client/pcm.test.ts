import { describe, expect, it } from "vitest";
import { pcm16ToFloat32 } from "./pcm";

describe("pcm16ToFloat32", () => {
  it("converts little-endian signed 16-bit samples to floats in [-1, 1]", () => {
    const bytes = new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80]); // 0, 32767, -32768
    const out = pcm16ToFloat32(bytes);
    expect(out.length).toBe(3);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(32767 / 32768, 6);
    expect(out[2]).toBe(-1);
  });

  it("ignores a trailing odd byte", () => {
    expect(pcm16ToFloat32(new Uint8Array([1, 0, 9])).length).toBe(1);
  });
});
