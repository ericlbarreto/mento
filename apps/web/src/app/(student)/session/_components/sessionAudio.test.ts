import { describe, expect, it, vi } from "vitest";
import type { SpeechPlayer } from "@mento/contracts";
import { createSessionAudio } from "./sessionAudio";

/** PcmPlayer stand-in exposing the private graph sessionAudio reaches (ctx + analyser). */
function fakePcm() {
  const ctx = {
    state: "running" as AudioContextState,
    suspend: vi.fn(async () => void (ctx.state = "suspended")),
    resume: vi.fn(async () => void (ctx.state = "running")),
    destination: {},
  };
  const player: SpeechPlayer & { ctx: typeof ctx; analyser: object } = {
    ctx,
    analyser: { connect: vi.fn(), disconnect: vi.fn() },
    play: vi.fn(async () => undefined),
    stop: vi.fn(),
    onWord: () => () => undefined,
    level: () => 0.8,
  };
  return { player, ctx };
}

describe("session audio pause", () => {
  it("suspends the AudioContext at once and resumes the same context", async () => {
    const { player, ctx } = fakePcm();
    const audio = createSessionAudio((p) => p, { createPlayer: () => player });
    expect(await audio.unlock()).toBe(true);
    expect(audio.level()).toBe(0.8);

    audio.pause();
    expect(audio.paused).toBe(true);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(audio.level()).toBe(0);
    audio.pause(); // idempotent
    await Promise.resolve();
    expect(ctx.suspend).toHaveBeenCalledTimes(1);

    audio.resume();
    expect(audio.paused).toBe(false);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(player.stop).not.toHaveBeenCalled(); // nothing is cut: the line continues
  });

  it("pausing before the voice exists is a no-op", () => {
    const audio = createSessionAudio((p) => p, { createPlayer: () => fakePcm().player });
    expect(() => {
      audio.pause();
      audio.resume();
    }).not.toThrow();
  });
});
