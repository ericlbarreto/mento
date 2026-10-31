const WORKLET = `
class Pcm16kChunker extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1280); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === 1280) {
        const out = new Int16Array(1280);
        for (let j = 0; j < 1280; j++) out[j] = Math.max(-1, Math.min(1, this.buf[j])) * 32767;
        this.port.postMessage(out.buffer, [out.buffer]);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm16k-chunker", Pcm16kChunker);
`;

export interface Mic {
  stop(): void;
  setMuted(muted: boolean): void;
}

/**
 * Captures the microphone as 80 ms chunks (1280 samples) of 16 kHz mono linear16.
 * The AudioContext runs at 16 kHz so the browser resamples the device stream (tested target: Chrome).
 * Echo cancellation is on, so the tutor's own voice does not trigger SpeechStarted (headphones still recommended).
 */
export async function startMic(onChunk: (pcm: ArrayBuffer) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm16k-chunker");
  let muted = false;
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!muted) onChunk(e.data);
  };
  source.connect(node);

  return {
    setMuted(value) {
      muted = value;
      stream.getAudioTracks().forEach((t) => (t.enabled = !value));
    },
    stop() {
      node.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
