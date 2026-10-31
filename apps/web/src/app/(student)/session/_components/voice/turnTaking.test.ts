import { describe, expect, it, vi } from "vitest";
import type { SpeechPlayer } from "@mento/contracts";
import { createSessionAudio } from "../sessionAudio";
import { micMuted, micStatus, shouldBargeIn, tutorHasFloor, voiceOrbState } from "./turnTaking";

describe("turn-taking", () => {
  it("keeps the floor with the tutor until script_done AND the queue played the last speak", () => {
    expect(tutorHasFloor({ turnOpen: true, scriptDone: false, queueState: "thinking" })).toBe(true);
    // script_done arrived while speaks are still queued: still the tutor's turn.
    expect(tutorHasFloor({ turnOpen: true, scriptDone: true, queueState: "playing" })).toBe(true);
    expect(tutorHasFloor({ turnOpen: true, scriptDone: true, queueState: "paused" })).toBe(true);
    // The queue drained (no speak playing) but the script is not done: more may come.
    expect(tutorHasFloor({ turnOpen: true, scriptDone: false, queueState: "idle" })).toBe(true);
    expect(tutorHasFloor({ turnOpen: true, scriptDone: true, queueState: "idle" })).toBe(false);
    expect(tutorHasFloor({ turnOpen: true, scriptDone: true, queueState: "waiting_answer" })).toBe(false);
    // Interrupted (turn closed): the student has the floor.
    expect(tutorHasFloor({ turnOpen: false, scriptDone: false, queueState: "playing" })).toBe(false);
  });

  it("mutes the mic while the tutor talks unless the student opened it, and always when the student muted it", () => {
    expect(micMuted({ userMuted: false, floor: true, openedDuringTurn: false })).toBe(true);
    expect(micMuted({ userMuted: false, floor: false, openedDuringTurn: false })).toBe(false);
    expect(micMuted({ userMuted: false, floor: true, openedDuringTurn: true })).toBe(false);
    expect(micMuted({ userMuted: true, floor: false, openedDuringTurn: false })).toBe(true);
  });

  it("barges in only while the tutor holds the floor or speaks", () => {
    expect(shouldBargeIn(true, null)).toBe(true);
    expect(shouldBargeIn(false, "act_1")).toBe(true);
    expect(shouldBargeIn(false, null)).toBe(false);
  });

  it("reports the mic state: permission and availability first, then turn-taking", () => {
    const base = { permission: "granted", unavailable: false, sttState: "listening", userMuted: false, floor: false, openedDuringTurn: false } as const;
    expect(micStatus(base)).toBe("listening");
    expect(micStatus({ ...base, sttState: "muted", floor: true })).toBe("held");
    expect(micStatus({ ...base, sttState: "muted", userMuted: true })).toBe("muted");
    expect(micStatus({ ...base, permission: "denied", sttState: "idle" })).toBe("denied");
    expect(micStatus({ ...base, unavailable: true, sttState: "error" })).toBe("unavailable");
    expect(micStatus({ ...base, permission: "asking", sttState: "idle" })).toBe("asking");
    expect(micStatus({ ...base, sttState: "error" })).toBe("error");
  });

  it("shows the orb listening only when idle with the mic open", () => {
    expect(voiceOrbState("idle", "listening")).toBe("listening");
    expect(voiceOrbState("idle", "muted")).toBe("idle");
    expect(voiceOrbState("speaking", "listening")).toBe("speaking");
    expect(voiceOrbState("waiting", "listening")).toBe("waiting");
  });
});

describe("session audio", () => {
  const fakePlayer = (play: SpeechPlayer["play"]): SpeechPlayer => ({ play: vi.fn(play), stop: vi.fn(), onWord: () => () => undefined, level: () => 0 });

  it("refuses to play before unlock, then plays the resolved URL with the turn's signal", async () => {
    const player = fakePlayer(async () => undefined);
    const audio = createSessionAudio((p) => `http://api${p}`, { createPlayer: () => player });
    await expect(audio.play("/api/tts/a1")).rejects.toThrow(/locked/);
    expect(await audio.unlock()).toBe(true);
    const signal = new AbortController().signal;
    await audio.play("/api/tts/a1", signal);
    expect(player.play).toHaveBeenLastCalledWith("http://api/api/tts/a1", signal);
  });

  it("reports a blocked unlock (resume never settles without a gesture) instead of hanging", async () => {
    const audio = createSessionAudio((p) => p, { timeoutMs: 10, createPlayer: () => fakePlayer(() => new Promise(() => undefined)) });
    expect(await audio.unlock()).toBe(false);
    expect(audio.unlocked).toBe(false);
  });

  it("plays a prefetched line from its downloaded copy", async () => {
    const played: string[] = [];
    const player = fakePlayer(async (url: string) => void played.push(url));
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array(4)])));
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:a2");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const audio = createSessionAudio((p) => `http://api${p}`, { createPlayer: () => player });
    await audio.unlock();
    audio.prefetch("/api/tts/a2");
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    await audio.play("/api/tts/a2");
    await audio.play("/api/tts/a3");
    expect(fetchMock).toHaveBeenCalledWith("http://api/api/tts/a2");
    expect(played.slice(-2)).toEqual(["blob:a2", "http://api/api/tts/a3"]);
    expect(revoke).toHaveBeenCalledWith("blob:a2");
    vi.unstubAllGlobals();
    create.mockRestore();
    revoke.mockRestore();
  });

  it("keeps playing while muted, so un-muting brings the voice back", async () => {
    const player = fakePlayer(async () => undefined);
    const audio = createSessionAudio((p) => p, { createPlayer: () => player });
    await audio.unlock();
    audio.setMuted(true);
    await expect(audio.play("/api/tts/a1")).resolves.toBeUndefined();
    expect(player.stop).not.toHaveBeenCalled();
    expect(audio.level()).toBe(0);
    audio.setMuted(false);
  });
});
