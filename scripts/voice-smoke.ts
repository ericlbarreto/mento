import WebSocket from "ws";
import {
  DEEPGRAM_LISTEN_PARAMS,
  ElevenLabsHttpProvider,
  ElevenLabsWsProvider,
  charsToWords,
  mintSttToken,
  type CharTiming,
  type TtsProvider,
} from "@mento/voice/server";

process.loadEnvFile(new URL("../.env", import.meta.url));
const env = process.env;
const need = (k: string) => {
  const v = env[k];
  if (!v) throw new Error(`${k} is not set in .env`);
  return v;
};

const TEXT = "Em vinte e sete antes de Cristo, o Senado deu a Otávio o título de Augusto.";
const voiceId = need("ELEVENLABS_VOICE_ID");
const modelId = env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";
const base = { apiKey: need("ELEVENLABS_API_KEY"), voiceId, modelId };

async function measure(name: string, provider: TtsProvider, runs = 3) {
  provider.warm?.();
  await new Promise((r) => setTimeout(r, 800)); // let the spare socket connect
  const rows: string[] = [];
  let audio = Buffer.alloc(0);
  let chars: CharTiming[] = [];
  for (let i = 1; i <= runs; i++) {
    const t0 = performance.now();
    let first = 0;
    const parts: Buffer[] = [];
    const cs: CharTiming[] = [];
    for await (const chunk of provider.synthesize({ text: TEXT })) {
      if (!first) first = performance.now() - t0;
      parts.push(chunk.audio);
      cs.push(...chunk.chars);
    }
    const total = performance.now() - t0;
    audio = Buffer.concat(parts);
    chars = cs;
    rows.push(`  run ${i}: first byte ${first.toFixed(0)} ms, total ${total.toFixed(0)} ms, ${(audio.length / 48).toFixed(0)} ms of audio`);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`ElevenLabs ${name}\n${rows.join("\n")}`);
  const words = charsToWords(chars);
  console.log(`  words: ${words.length}, first ${JSON.stringify(words[0])}, last ${JSON.stringify(words.at(-1))}`);
  provider.close?.();
  return audio;
}

async function deepgramLoopback(pcm24k: Buffer) {
  const { token } = await mintSttToken({ apiKey: need("DEEPGRAM_API_KEY") });
  console.log(`Deepgram token minted (${token.slice(0, 8)}…)`);
  const params = { ...DEEPGRAM_LISTEN_PARAMS, sample_rate: "24000" };
  for (const scheme of ["bearer", "token"]) {
    const url = `wss://api.deepgram.com/v1/listen?${new URLSearchParams(params).toString()}`;
    const result = await new Promise<string>((resolve) => {
      const ws = new WebSocket(url, [scheme, token]);
      const finals: string[] = [];
      const timeout = setTimeout(() => (ws.close(), resolve(finals.join(" ") || "(no transcript)")), 12000);
      ws.on("open", async () => {
        for (let i = 0; i < pcm24k.length; i += 3840) ws.send(pcm24k.subarray(i, i + 3840)); // 80 ms chunks
        ws.send(JSON.stringify({ type: "Finalize" }));
        setTimeout(() => ws.send(JSON.stringify({ type: "CloseStream" })), 1500);
      });
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString());
        if (m.type === "Results" && m.is_final) finals.push(m.channel.alternatives[0].transcript);
      });
      ws.on("close", () => (clearTimeout(timeout), resolve(finals.join(" ") || "(no transcript)")));
      ws.on("error", (e) => (clearTimeout(timeout), resolve(`ERROR: ${(e as Error).message}`)));
    });
    console.log(`Deepgram subprotocol ["${scheme}", jwt] → ${result}`);
  }
}

const httpAudio = await measure("HTTP with-timestamps", new ElevenLabsHttpProvider(base));
await measure("WebSocket stream-input", new ElevenLabsWsProvider(base));
await deepgramLoopback(httpAudio);
console.log(`\nSent text : ${TEXT}`);
