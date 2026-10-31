import { describe, expect, it, vi } from "vitest";
import type { SpeechPlayer } from "@mento/contracts";
import { createSessionAudio } from "../sessionAudio";
import { judgeCaption, micMuted, micStatus, shouldBargeIn, tutorHasFloor, voiceOrbState } from "./turnTaking";

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

  it("keeps the mic open while the tutor talks (the browser cancels the echo); only the student's own mute closes it", () => {
    expect(micMuted({ userMuted: false })).toBe(false);
    expect(micMuted({ userMuted: true })).toBe(true);
  });

  it("barges in only while the tutor holds the floor or speaks", () => {
    expect(shouldBargeIn(true, null)).toBe(true);
    expect(shouldBargeIn(false, "act_1")).toBe(true);
    expect(shouldBargeIn(false, null)).toBe(false);
  });

  it("reports the mic state: permission and availability first, then turn-taking", () => {
    const base = { permission: "granted", unavailable: false, sttState: "listening", userMuted: false } as const;
    expect(micStatus(base)).toBe("listening");
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

  describe("judgeCaption (speakers instead of headphones)", () => {
    const tutorText = "Em 27 a.C., o Senado deu a Otávio o título de Augusto.";
    const during = { tutorActive: true, tutorText };

    it("sends a final caption as the student's message when the tutor is quiet", () => {
      expect(judgeCaption({ kind: "final", text: "Quem foi Augusto?", tutorActive: false, tutorText })).toBe("send");
      expect(judgeCaption({ kind: "interim", text: "Quem foi", tutorActive: false, tutorText })).toBe("wait");
    });

    it("never cuts the tutor on the tutor's own voice picked up by the mic", () => {
      expect(judgeCaption({ kind: "interim", text: "o Senado deu a Otávio", ...during })).toBe("wait");
      expect(judgeCaption({ kind: "final", text: "o Senado deu a Otávio o título", ...during })).toBe("drop");
    });

    it("waits for two words in an interim caption before cutting the tutor", () => {
      expect(judgeCaption({ kind: "interim", text: "Espera", ...during })).toBe("wait");
      expect(judgeCaption({ kind: "interim", text: "Espera aí", ...during })).toBe("interrupt");
    });

    it("a different final caption cuts the tutor and is sent", () => {
      expect(judgeCaption({ kind: "final", text: "Pare", ...during })).toBe("interrupt_and_send");
    });

    it("drops an empty final caption while the tutor talks", () => {
      expect(judgeCaption({ kind: "final", text: "  ", ...during })).toBe("drop");
    });
  });
});
