// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createBoardStore } from "../store";
import { createBoardWriter } from "./writer";

/** A Web Animation stand-in (jsdom has none): a diagram stroke drawn by the renderer. */
function fakeAnimation() {
  const a = { playState: "running" as AnimationPlayState, pause: vi.fn(), play: vi.fn() };
  a.pause.mockImplementation(() => (a.playState = "paused"));
  a.play.mockImplementation(() => (a.playState = "running"));
  return a;
}

describe("board writer pause", () => {
  it("freezes the board's running animations on pause and plays them again on resume", () => {
    const store = createBoardStore();
    const writer = createBoardWriter(store);
    const world = document.createElement("div");
    const running = fakeAnimation();
    const finished = { ...fakeAnimation(), playState: "finished" as AnimationPlayState };
    (world as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [running, finished];
    const detach = writer.attach(world, document.createElement("div"));

    store.animation.setPaused(true);
    expect(running.pause).toHaveBeenCalledTimes(1);
    expect(finished.pause).not.toHaveBeenCalled();
    store.animation.setPaused(false);
    expect(running.play).toHaveBeenCalledTimes(1);
    expect(finished.play).not.toHaveBeenCalled();
    detach();
  });
});
