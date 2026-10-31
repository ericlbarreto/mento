import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceTokenResponse } from "@mento/contracts";
import { createSttSession } from "./stt-session";

class FakeWebSocket {
  static last: FakeWebSocket;
  sent: (string | ArrayBuffer)[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string, public protocols: string[]) {
    FakeWebSocket.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(d: string | ArrayBuffer) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const token: VoiceTokenResponse = {
  token: "jwt-1",
  expires_in: 30,
  ws_url: "wss://api.deepgram.com/v1/listen",
  params: { model: "nova-3", language: "pt-BR" },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSttSession", () => {
  it("connects with the token as a subprotocol, forwards audio and turns messages into events", async () => {
    const events: unknown[] = [];
    const session = createSttSession({
      getToken: async () => token,
      WebSocketImpl: FakeWebSocket as never,
      onEvent: (e) => events.push(e),
    });
    await session.start();
    const ws = FakeWebSocket.last;
    expect(ws.url).toBe("wss://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR");
    expect(ws.protocols).toEqual(["bearer", "jwt-1"]);

    const chunk = new ArrayBuffer(2560);
    session.sendAudio(chunk);
    expect(ws.sent).toContain(chunk);

    ws.onmessage?.({ data: JSON.stringify({ type: "SpeechStarted" }) });
    expect(events).toEqual([{ type: "speech_started" }]);
  });

  it("does not send audio while muted and sends KeepAlive every few seconds instead", async () => {
    const session = createSttSession({ getToken: async () => token, WebSocketImpl: FakeWebSocket as never, onEvent: () => undefined });
    await session.start();
    const ws = FakeWebSocket.last;
    session.setMuted(true);
    session.sendAudio(new ArrayBuffer(10));
    expect(ws.sent.filter((m) => typeof m !== "string")).toHaveLength(0);
    vi.advanceTimersByTime(8100);
    expect(ws.sent.filter((m) => m === JSON.stringify({ type: "KeepAlive" })).length).toBe(2);
    session.setMuted(false);
    vi.advanceTimersByTime(8000);
    expect(ws.sent.filter((m) => m === JSON.stringify({ type: "KeepAlive" })).length).toBe(2); // stopped
  });

  it("sends CloseStream on stop", async () => {
    const session = createSttSession({ getToken: async () => token, WebSocketImpl: FakeWebSocket as never, onEvent: () => undefined });
    await session.start();
    const ws = FakeWebSocket.last;
    session.stop();
    expect(ws.sent).toContain(JSON.stringify({ type: "CloseStream" }));
  });
});
