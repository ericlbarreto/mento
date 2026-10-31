import type { VoiceTokenResponse } from "@mento/contracts";
import { DeepgramCaptionBuilder, type SttEvent } from "./deepgram-parse";

export interface SttSessionOptions {
  /** Calls POST /api/voice/token. */
  getToken: () => Promise<VoiceTokenResponse>;
  onEvent: (event: SttEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  WebSocketImpl?: typeof WebSocket;
  /**
   * WebSocket subprotocols that carry the token. Default `["bearer", token]` **[verify day 0]**: the Deepgram
   * docs show `["token", apiKey]` for API keys and do not document the JWT form on the pages read.
   */
  protocolsFor?: (token: string) => string[];
}

export interface SttSession {
  start(): Promise<void>;
  /** 80 ms of 16 kHz mono linear16 audio (1280 samples = 2560 bytes). Ignored while muted. */
  sendAudio(chunk: ArrayBuffer): void;
  /** While muted, audio is dropped and KeepAlive keeps the connection open (it closes after ~10 s without audio). */
  setMuted(muted: boolean): void;
  stop(): void;
}

const KEEPALIVE_MS = 4000;

export function createSttSession(opts: SttSessionOptions): SttSession {
  const WS = opts.WebSocketImpl ?? WebSocket;
  const builder = new DeepgramCaptionBuilder();
  let ws: WebSocket | null = null;
  let muted = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stopKeepAlive = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startKeepAlive = () => {
    stopKeepAlive();
    timer = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ type: "KeepAlive" })), KEEPALIVE_MS);
  };

  return {
    async start() {
      const t = await opts.getToken();
      const url = `${t.ws_url}?${new URLSearchParams(t.params).toString()}`;
      const protocols = opts.protocolsFor ? opts.protocolsFor(t.token) : ["bearer", t.token];
      ws = new WS(url, protocols);
      const socket = ws;
      socket.onmessage = (e: MessageEvent) => {
        try {
          for (const ev of builder.handle(JSON.parse(String(e.data)))) opts.onEvent(ev);
        } catch (err) {
          opts.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      };
      socket.onerror = () => opts.onError?.(new Error("Deepgram WebSocket error"));
      socket.onclose = () => {
        stopKeepAlive();
        opts.onClose?.();
      };
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        const prevError = socket.onerror;
        socket.onerror = (ev) => {
          prevError?.call(socket, ev);
          reject(new Error("Deepgram WebSocket failed to open"));
        };
      });
    },
    sendAudio(chunk) {
      if (!ws || ws.readyState !== 1 || muted) return;
      ws.send(chunk);
    },
    setMuted(value) {
      muted = value;
      if (muted) startKeepAlive();
      else stopKeepAlive();
    },
    stop() {
      stopKeepAlive();
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "CloseStream" }));
      ws?.close();
      ws = null;
    },
  };
}
