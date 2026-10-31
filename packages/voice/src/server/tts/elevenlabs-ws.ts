import WebSocket from "ws";
import { AlignmentAccumulator, type StreamAlignmentChunk } from "../alignment";
import { AsyncQueue } from "../async-queue";
import type { TtsChunk, TtsProvider, TtsRequest } from "./types";

/** The subset of `ws` this provider needs (so tests can inject a fake). */
export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  // Listener arguments differ per event (Buffer, Error, none); `ws` and EventEmitter type them as any[].
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: "open" | "close" | "error" | "message", listener: (...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once(event: "open" | "close" | "error", listener: (...args: any[]) => void): unknown;
}
export type WsFactory = (url: string, headers: Record<string, string>) => WsLike;

export interface ElevenLabsWsOptions {
  apiKey: string;
  voiceId: string;
  modelId: string;
  baseUrl?: string; // default wss://api.elevenlabs.io
  factory?: WsFactory;
}

const OPEN = 1;
const defaultFactory: WsFactory = (url, headers) => new WebSocket(url, { headers }) as unknown as WsLike;

/**
 * Streaming TTS. One socket per `speak` (a text message plus an end-of-input message); a spare, already
 * initialized socket is opened ahead of time (`warm()`), so the TLS/WebSocket handshake is paid before it is needed.
 */
export class ElevenLabsWsProvider implements TtsProvider {
  private spare: Promise<WsLike> | null = null;
  private readonly factory: WsFactory;

  constructor(private readonly opts: ElevenLabsWsOptions) {
    this.factory = opts.factory ?? defaultFactory;
  }

  warm(): void {
    if (this.spare) return;
    const p = this.open();
    this.spare = p;
    p.catch(() => {
      if (this.spare === p) this.spare = null;
    });
  }

  close(): void {
    const p = this.spare;
    this.spare = null;
    p?.then((s) => s.close()).catch(() => undefined);
  }

  private url(): string {
    const { voiceId, modelId, baseUrl = "wss://api.elevenlabs.io" } = this.opts;
    const q = new URLSearchParams({
      model_id: modelId,
      output_format: "pcm_24000",
      language_code: "pt",
      auto_mode: "true",
      inactivity_timeout: "60",
    });
    return `${baseUrl}/v1/text-to-speech/${voiceId}/stream-input?${q.toString()}`;
  }

  private open(): Promise<WsLike> {
    return new Promise<WsLike>((resolve, reject) => {
      const socket = this.factory(this.url(), { "xi-api-key": this.opts.apiKey });
      socket.once("open", () => {
        socket.send(JSON.stringify({ text: " " }));
        resolve(socket);
      });
      socket.once("error", (err: Error) => reject(err));
      socket.once("close", () => reject(new Error("ElevenLabs socket closed while connecting")));
    });
  }

  private async take(): Promise<WsLike> {
    let socket: WsLike | null = null;
    if (this.spare) {
      const p = this.spare;
      this.spare = null;
      try {
        const s = await p;
        if (s.readyState === OPEN) socket = s;
      } catch {
        socket = null;
      }
    }
    return socket ?? (await this.open());
  }

  async *synthesize(req: TtsRequest): AsyncGenerator<TtsChunk> {
    if (req.signal?.aborted) return;
    const socket = await this.take();
    this.warm(); // prepare the next one in the background

    const queue = new AsyncQueue<TtsChunk>();
    const acc = new AlignmentAccumulator();
    let finished = false;

    socket.on("message", (data: Buffer) => {
      let msg: { audio?: string | null; alignment?: StreamAlignmentChunk; isFinal?: boolean; error?: string };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.error) {
        finished = true;
        queue.fail(new Error(`ElevenLabs error: ${msg.error}`));
        return;
      }
      if (msg.audio) {
        const audio = Buffer.from(msg.audio, "base64");
        queue.push({ audio, chars: acc.push(msg.alignment, audio.length) });
      }
      if (msg.isFinal) {
        finished = true;
        queue.end();
        socket.close();
      }
    });
    socket.on("error", (err: Error) => {
      finished = true;
      queue.fail(err);
    });
    socket.on("close", () => {
      if (!finished) queue.fail(new Error("ElevenLabs socket closed before the final message"));
    });
    const onAbort = () => {
      finished = true;
      queue.end();
      socket.close();
    };
    req.signal?.addEventListener("abort", onAbort, { once: true });

    socket.send(JSON.stringify({ text: `${req.text} ` }));
    socket.send(JSON.stringify({ text: "" }));

    try {
      for await (const chunk of queue) yield chunk;
    } finally {
      req.signal?.removeEventListener("abort", onAbort);
      if (socket.readyState === OPEN) socket.close();
    }
  }
}
