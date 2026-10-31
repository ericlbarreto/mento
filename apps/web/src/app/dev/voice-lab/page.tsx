"use client";

import { useMemo, useRef, useState } from "react";
import { VoiceTokenResponse } from "@mento/contracts";
import { PcmPlayer, useStt } from "@mento/voice/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Dev page (owner: Person 3): talk, see live captions, and hear a tutor line from POST-less GET /api/tts.
export default function VoiceLab() {
  const player = useMemo(() => new PcmPlayer(), []);
  const [finals, setFinals] = useState<string[]>([]);
  const [text, setText] = useState("Em 27 a.C., o Senado deu a Otávio o título de Augusto.");
  const [log, setLog] = useState<string[]>([]);
  const speechEnd = useRef<number>(0);

  const stt = useStt({
    getToken: async () => VoiceTokenResponse.parse(await (await fetch(`${API}/api/voice/token`, { method: "POST" })).json()),
    onFinal: (c) => {
      speechEnd.current = performance.now();
      setFinals((f) => [...f, c.text]);
    },
    onSpeechStarted: () => {
      player.stop();
      setLog((l) => [...l, "speech started: player stopped"]);
    },
  });

  async function speak() {
    const action_id = `lab_${Date.now()}`;
    const t0 = performance.now();
    setLog((l) => [...l, "requesting audio…"]);
    // The TTS job is started by the turn handler in Plan 3; for the lab, call the lab-only start route if present.
    const start = await fetch(`${API}/api/dev/tts-start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action_id, text }),
    });
    if (!start.ok) return setLog((l) => [...l, `tts-start failed: HTTP ${start.status}`]);
    player.onWord((w) => setLog((l) => [...l.slice(-30), `word: ${w.word}`]));
    await player.play(`${API}/api/tts/${action_id}`);
    setLog((l) => [...l, `done in ${(performance.now() - t0).toFixed(0)} ms`]);
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 720 }}>
      <h1>Voice lab (dev)</h1>
      <section>
        <button onClick={() => (stt.state === "idle" || stt.state === "error" ? stt.start() : stt.stop())}>
          {stt.state === "idle" || stt.state === "error" ? "Start microphone" : "Stop microphone"} ({stt.state})
        </button>{" "}
        <button onClick={() => stt.setMuted(stt.state !== "muted")}>Mute / unmute</button>
        <p>Live caption: <b>{stt.caption?.text ?? "…"}</b> ({stt.caption?.kind})</p>
        <ol>{finals.map((f, i) => <li key={i}>{f}</li>)}</ol>
      </section>
      <section>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ width: "100%" }} />
        <button onClick={speak}>Speak (ElevenLabs)</button>
      </section>
      <pre style={{ background: "#00000010", padding: 12, maxHeight: 240, overflow: "auto" }}>{log.join("\n")}</pre>
    </main>
  );
}
