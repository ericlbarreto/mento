import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ElevenLabsWsProvider, type WsLike } from "./elevenlabs-ws";
import type { TtsChunk } from "./types";

class FakeSocket extends EventEmitter implements WsLike {
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.emit("close");
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  receive(obj: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(obj)));
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const urls: { url: string; headers: Record<string, string> }[] = [];
  const provider = new ElevenLabsWsProvider({
    apiKey: "el-key",
    voiceId: "voice-1",
    modelId: "eleven_flash_v2_5",
    factory: (url, headers) => {
      const s = new FakeSocket();
      sockets.push(s);
      urls.push({ url, headers });
      queueMicrotask(() => s.open());
      return s;
    },
  });
  return { provider, sockets, urls };
}

const audio = (n: number) => Buffer.alloc(n, 1).toString("base64");

async function collect(gen: AsyncGenerator<TtsChunk>) {
  const out: TtsChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

describe("ElevenLabsWsProvider", () => {
  it("connects with the API key header, sends init, text and end, and streams chunks with absolute timings", async () => {
    const { provider, sockets, urls } = setup();
    const run = collect(provider.synthesize({ text: "Oi a" }));
    await new Promise((r) => setTimeout(r, 5));
    const s = sockets[0]!;
    expect(urls[0]?.headers["xi-api-key"]).toBe("el-key");
    expect(urls[0]?.url).toContain("/v1/text-to-speech/voice-1/stream-input?");
    expect(urls[0]?.url).toContain("model_id=eleven_flash_v2_5");
    expect(urls[0]?.url).toContain("output_format=pcm_24000");
    expect(urls[0]?.url).toContain("language_code=pt");
    expect(s.sent.map((m) => JSON.parse(m))).toEqual([{ text: " " }, { text: "Oi a " }, { text: "" }]);

    s.receive({ audio: audio(4800), alignment: { chars: ["O", "i"], charStartTimesMs: [0, 40], charDurationsMs: [40, 60] } });
    s.receive({ audio: audio(2400), alignment: { chars: [" ", "a"], charStartTimesMs: [0, 30], charDurationsMs: [30, 20] } });
    s.receive({ isFinal: true });

    const chunks = await run;
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.audio.length).toBe(4800);
    expect(chunks[1]?.chars.map((c) => c.start_ms)).toEqual([100, 130]);
  });

  it("opens a spare socket after use so the next speak does not pay the handshake", async () => {
    const { provider, sockets } = setup();
    const first = collect(provider.synthesize({ text: "um" }));
    await new Promise((r) => setTimeout(r, 5));
    sockets[0]!.receive({ isFinal: true });
    await first;
    await new Promise((r) => setTimeout(r, 5));
    expect(sockets.length).toBe(2); // spare opened in the background
    const second = collect(provider.synthesize({ text: "dois" }));
    await new Promise((r) => setTimeout(r, 5));
    expect(sockets.length).toBe(3); // a new spare again, the second request used socket #2
    expect(sockets[1]!.sent.map((m) => JSON.parse(m).text)).toEqual([" ", "dois ", ""]);
    sockets[1]!.receive({ isFinal: true });
    await second;
  });

  it("closes the socket and stops when aborted", async () => {
    const { provider, sockets } = setup();
    const controller = new AbortController();
    const run = collect(provider.synthesize({ text: "longo", signal: controller.signal }));
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    expect(await run).toEqual([]);
    expect(sockets[0]!.closed).toBe(true);
  });

  it("fails when the socket closes before the final message", async () => {
    const { provider, sockets } = setup();
    const run = collect(provider.synthesize({ text: "x" }));
    await new Promise((r) => setTimeout(r, 5));
    sockets[0]!.close();
    await expect(run).rejects.toThrow("closed before");
  });
});
