"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListSubjectsResponse,
  StreamMessage,
  VoiceTokenResponse,
  type Action,
  type Citation,
  type SubjectSummary,
  type TurnRequest,
  type WordTiming,
} from "@mento/contracts";
import { PcmPlayer, useStt } from "@mento/voice/client";

// Dev page (owner: Person 3): talk to the tutor end to end (subjects, voice or text, board actions, citations,
// images, verification answers, click-and-ask, interruption) and see the latency of every turn.
// It is a test bench, not the real whiteboard UI (Person 2).

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Column = "main" | "visuals" | "side";
interface BoardItem {
  id: string;
  column: Column;
  kind: "text" | "timeline" | "image" | "question";
  html?: string;
  events?: { date: string; label: string }[];
  prompt?: string;
  url?: string;
  question?: string;
  highlight?: string;
  circles: { text: string; color: string }[];
  sources?: Citation[];
  outside?: boolean;
}
interface Line {
  who: "aluno" | "tutor" | "sistema";
  text: string;
  sources?: Citation[];
  outside?: boolean;
}
interface TurnStats {
  turn: number;
  label: string;
  first_action_ms?: number;
  first_audio_ms?: number;
  script_done_ms?: number;
  turn_done_ms?: number;
  server?: Record<string, number | undefined>;
}
type Appended = TurnRequest["appended"][number];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function markCircles(html: string, circles: BoardItem["circles"]): string {
  let out = html;
  for (const c of circles) {
    const i = out.toLocaleLowerCase("pt-BR").indexOf(c.text.toLocaleLowerCase("pt-BR"));
    if (i >= 0) {
      const found = out.slice(i, i + c.text.length);
      out = `${out.slice(0, i)}<span style="outline:2px solid ${c.color};border-radius:999px;padding:0 4px">${found}</span>${out.slice(i + c.text.length)}`;
    }
  }
  return out;
}

export default function ConversationLab() {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [modality, setModality] = useState<"voice" | "text">("voice");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [caption, setCaption] = useState<{ text: string; spoken: number } | null>(null);
  const [stats, setStats] = useState<TurnStats[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<{ element_id: string; text?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const player = useMemo(() => new PcmPlayer(), []);
  const queue = useRef<Action[]>([]);
  const working = useRef(false);
  const words = useRef(new Map<string, WordTiming[]>());
  const playing = useRef<{ action_id: string; text: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastTurnId = useRef<string | null>(null);
  const openQuestion = useRef<{ verification_id: string; element_id: string } | null>(null);
  const turnNo = useRef(0);
  const sentAt = useRef(0);
  const speechEndAt = useRef<number | null>(null);
  const turnFirstAudio = useRef(false);

  useEffect(() => {
    fetch(`${API}/api/subjects`)
      .then(async (r) => (r.ok ? ListSubjectsResponse.parse(await r.json()).subjects : []))
      .then(setSubjects)
      .catch(() => setSubjects([]));
    return player.onWord(() => setCaption((c) => (c ? { ...c, spoken: c.spoken + 1 } : c)));
  }, [player]);

  const patchStats = (turn: number, patch: Partial<TurnStats>) =>
    setStats((all) => all.map((s) => (s.turn === turn ? { ...s, ...patch } : s)));

  // ---- board actions ----
  function apply(action: Action) {
    switch (action.name) {
      case "write_text":
        setBoard((b) => [...b, { id: action.args.id, column: action.args.column, kind: "text", html: action.args.html, circles: [], sources: action.args.sources, outside: action.args.outside_material }]);
        break;
      case "write_timeline":
        setBoard((b) => [...b, { id: action.args.id, column: action.args.column, kind: "timeline", events: action.args.events, circles: [] }]);
        break;
      case "draw":
        setBoard((b) => [...b, { id: action.args.id, column: action.args.column, kind: "image", prompt: action.args.prompt, circles: [] }]);
        break;
      case "draw_result":
        setBoard((b) => b.map((e) => (e.id === action.args.element_id ? { ...e, url: `${API}${action.args.url}` } : e)));
        break;
      case "ask_verification":
        openQuestion.current = { verification_id: action.args.verification_id, element_id: action.args.id };
        setBoard((b) => [...b, { id: action.args.id, column: action.args.column, kind: "question", question: action.args.question, circles: [] }]);
        break;
      case "highlight":
        setBoard((b) => b.map((e) => (e.id === action.args.target_id ? { ...e, highlight: action.args.color } : e)));
        break;
      case "circle_annotate":
        setBoard((b) => b.map((e) => (e.id === action.args.target_id ? { ...e, circles: [...e.circles, { text: action.args.text_to_match, color: action.args.color }] } : e)));
        break;
      case "update_element":
        setBoard((b) => b.map((e) => (e.id === action.args.id ? { ...e, kind: "text", html: action.args.html, url: undefined } : e)));
        break;
      case "remove_element":
        setBoard((b) => b.filter((e) => e.id !== action.args.id));
        break;
      case "speak":
        break;
    }
  }

  async function work(turn: number) {
    if (working.current) return;
    working.current = true;
    try {
      while (queue.current.length) {
        const action = queue.current.shift() as Action;
        if (action.name !== "speak") {
          apply(action);
          continue;
        }
        const { text, audio_url, sources, outside_material } = action.args;
        setLines((l) => [...l, { who: "tutor", text, sources, outside: outside_material }]);
        setCaption({ text, spoken: 0 });
        playing.current = { action_id: action.id, text };
        if (audio_url && modality === "voice") {
          player.setWords(words.current.get(action.id) ?? []);
          const t0 = performance.now();
          const signal = controller.current?.signal;
          const started = player.play(`${API}${audio_url}`, signal).catch(() => undefined);
          if (!turnFirstAudio.current) {
            turnFirstAudio.current = true;
            patchStats(turn, { first_audio_ms: Math.round(t0 - sentAt.current) });
            if (speechEndAt.current) speechEndAt.current = null;
          }
          await started;
        } else {
          await sleep(Math.min(2500, 250 + text.length * 25)); // text mode: time to read the caption
        }
        playing.current = null;
      }
    } finally {
      working.current = false;
      setCaption(null);
    }
  }

  // ---- turns ----
  function interrupt(): TurnRequest["interrupted"] | undefined {
    const wasPlaying = playing.current;
    controller.current?.abort();
    player.stop();
    queue.current = [];
    setCaption(null);
    setBusy(false);
    if (!lastTurnId.current) return undefined;
    return {
      turn_id: lastTurnId.current,
      ...(wasPlaying ? { action_id: wasPlaying.action_id, spoken_chars: Math.round(wasPlaying.text.length / 2) } : {}),
    };
  }

  async function sendTurn(id: string, appended: Appended[], label: string) {
    const interrupted = busy || playing.current ? interrupt() : undefined;
    const ctrl = new AbortController();
    controller.current = ctrl;
    const turn = ++turnNo.current;
    sentAt.current = performance.now();
    turnFirstAudio.current = false;
    setStats((s) => [...s, { turn, label }]);
    setBusy(true);
    setError(null);
    const body: TurnRequest = { modality, appended, ...(interrupted ? { interrupted } : {}) };
    try {
      const res = await fetch(`${API}/api/sessions/${id}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`turno falhou: HTTP ${res.status} ${await res.text()}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let first = true;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!data) continue;
          const m = StreamMessage.parse(JSON.parse(data));
          const at = Math.round(performance.now() - sentAt.current);
          if (m.type === "action") {
            if (first) {
              first = false;
              patchStats(turn, { first_action_ms: at });
            }
            if (m.action.name === "draw_result") apply(m.action); // late image: show it at once
            else {
              queue.current.push(m.action);
              void work(turn);
            }
          } else if (m.type === "speech_alignment") {
            words.current.set(m.action_id, m.words);
            if (playing.current?.action_id === m.action_id) player.setWords(m.words);
          } else if (m.type === "script_done") {
            lastTurnId.current = m.turn_id;
            patchStats(turn, { script_done_ms: at });
          } else if (m.type === "turn_done") {
            patchStats(turn, { turn_done_ms: at, server: m.timing });
          } else if (m.type === "error") {
            setError(`${m.code}: ${m.message}`);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      if (controller.current === ctrl) setBusy(false);
    }
  }

  function sendStudent(text: string, kind: "speech" | "chat") {
    if (!sessionId || !text.trim()) return;
    setLines((l) => [...l, { who: "aluno", text }]);
    let appended: Appended[];
    if (openQuestion.current && !selected) {
      appended = [{ name: "verification_answer", verification_id: openQuestion.current.verification_id, element_id: openQuestion.current.element_id, answer: text }];
      openQuestion.current = null;
    } else if (selected) {
      appended = [{ name: "user_message", kind: "board_select", text, selected }];
      setSelected(null);
    } else {
      appended = [{ name: "user_message", kind, text }];
    }
    void sendTurn(sessionId, appended, text.slice(0, 40));
  }

  // ---- voice ----
  const stt = useStt({
    getToken: async () => VoiceTokenResponse.parse(await (await fetch(`${API}/api/voice/token`, { method: "POST" })).json()),
    onSpeechStarted: () => {
      if (busy || playing.current) {
        const info = interrupt();
        if (info) lastTurnId.current = info.turn_id;
        setLines((l) => [...l, { who: "sistema", text: "(interrompido pelo aluno)" }]);
      }
    },
    onFinal: (c) => {
      speechEndAt.current = performance.now();
      sendStudent(c.text, "speech");
    },
  });

  async function start() {
    setBoard([]);
    setLines([]);
    setStats([]);
    setError(null);
    openQuestion.current = null;
    lastTurnId.current = null;
    turnNo.current = 0;
    const res = await fetch(`${API}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ student_id: "demo", modality, subject_id: subjectId || null }),
    });
    if (!res.ok) return setError(`sessão falhou: HTTP ${res.status} ${await res.text()}`);
    const { id } = (await res.json()) as { id: string };
    setSessionId(id);
    if (modality === "voice") void stt.start();
    await sleep(800); // let the prompt cache pre-warm
    void sendTurn(id, [], "(abertura)");
  }

  async function end() {
    if (!sessionId) return;
    interrupt();
    stt.stop();
    await fetch(`${API}/api/sessions/${sessionId}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "manual" }) });
    setSessionId(null);
  }

  // ---- render ----
  const column = (c: Column) =>
    board
      .filter((e) => e.column === c)
      .map((e) => (
        <div
          key={e.id}
          data-element-id={e.id}
          onClick={() => setSelected({ element_id: e.id, text: window.getSelection()?.toString() || undefined })}
          style={{
            border: selected?.element_id === e.id ? "2px solid #1E59ED" : "1px solid #e4dcc8",
            background: e.highlight ? `color-mix(in srgb, ${e.highlight} 35%, white)` : "white",
            borderRadius: 12,
            padding: 10,
            marginBottom: 10,
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.5 }}>{e.id}</div>
          {e.kind === "text" && <div dangerouslySetInnerHTML={{ __html: markCircles(e.html ?? "", e.circles) }} />}
          {e.kind === "timeline" && (
            <ol style={{ margin: 0 }}>
              {e.events?.map((ev) => {
                const circled = e.circles.find((c) => `${ev.date} ${ev.label}`.toLowerCase().includes(c.text.toLowerCase()));
                return (
                  <li key={ev.date + ev.label} style={circled ? { outline: `2px solid ${circled.color}`, borderRadius: 999, padding: "0 6px" } : undefined}>
                    <b>{ev.date}</b> {ev.label}
                  </li>
                );
              })}
            </ol>
          )}
          {e.kind === "image" &&
            (e.url ? (
              <img src={e.url} alt={e.prompt} style={{ width: "100%", mixBlendMode: "multiply" }} />
            ) : (
              <div style={{ height: 160, display: "grid", placeItems: "center", background: "#f4eddc", borderRadius: 8, fontSize: 13 }}>desenhando… {e.prompt?.slice(0, 60)}</div>
            ))}
          {e.kind === "question" && (
            <div>
              <b>Pergunta:</b> {e.question}
              <div style={{ fontSize: 12, opacity: 0.6 }}>responda falando ou digitando</div>
            </div>
          )}
          {e.sources?.map((s) => (
            <span key={s.page + s.quote} title={s.quote} style={{ fontSize: 11, background: "#dce6fd", borderRadius: 999, padding: "1px 8px", marginRight: 4 }}>
              📖 p.{s.page}
            </span>
          ))}
          {e.outside && <span style={{ fontSize: 11, background: "#ffe1d6", borderRadius: 999, padding: "1px 8px" }}>fora do material</span>}
        </div>
      ));

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", background: "#FBF7EE", minHeight: "100vh", color: "#162250" }}>
      <h1 style={{ margin: "0 0 8px" }}>Conversation lab (dev)</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!!sessionId}>
          <option value="">Sem matéria (whiteboard livre)</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.material_count} {s.material_count === 1 ? "material" : "materiais"})
            </option>
          ))}
        </select>
        <select value={modality} onChange={(e) => setModality(e.target.value as "voice" | "text")} disabled={!!sessionId}>
          <option value="voice">voz</option>
          <option value="text">texto</option>
        </select>
        {!sessionId ? <button onClick={start}>Iniciar conversa</button> : <button onClick={end}>Encerrar</button>}
        {sessionId && modality === "voice" && (
          <>
            <button onClick={() => stt.setMuted(stt.state !== "muted")}>{stt.state === "muted" ? "Ligar microfone" : "Mutar microfone"}</button>
            <span style={{ fontSize: 13 }}>
              mic: {stt.state} {stt.caption && stt.caption.kind === "interim" ? `· “${stt.caption.text}”` : ""}
            </span>
          </>
        )}
        {busy && <span style={{ fontSize: 13 }}>tutor pensando/falando…</span>}
      </div>
      {error && <div style={{ background: "#ffe1d6", padding: 8, borderRadius: 8, marginBottom: 8 }}>{error}</div>}

      {caption && (
        <div style={{ background: "white", borderRadius: 12, padding: 10, marginBottom: 10, fontSize: 18 }}>
          {caption.text.split(/\s+/).map((w, i) => (
            <span key={i} style={{ opacity: modality === "voice" && i >= caption.spoken ? 0.45 : 1 }}>{w} </span>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr 1.2fr", gap: 12 }}>
        <section><h3>main</h3>{column("main")}</section>
        <section><h3>visuals</h3>{column("visuals")}</section>
        <section><h3>side</h3>{column("side")}</section>
        <section>
          <h3>conversa</h3>
          <div style={{ maxHeight: 420, overflow: "auto", fontSize: 14 }}>
            {lines.map((l, i) => (
              <p key={i} style={{ margin: "4px 0" }}>
                <b>{l.who}:</b> {l.text} {l.sources?.map((s) => <span key={s.page + s.quote} title={s.quote}> 📖p.{s.page}</span>)}
                {l.outside ? " (fora do material)" : ""}
              </p>
            ))}
          </div>
          {selected && (
            <div style={{ fontSize: 12, margin: "6px 0" }}>
              perguntando sobre <b>{selected.element_id}</b> {selected.text ? `“${selected.text}”` : ""} <button onClick={() => setSelected(null)}>x</button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendStudent(input, "chat");
              setInput("");
            }}
            style={{ display: "flex", gap: 6 }}
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="digite (ou fale)" style={{ flex: 1 }} disabled={!sessionId} />
            <button disabled={!sessionId}>Enviar</button>
          </form>
        </section>
      </div>

      <h3>latência por turno (ms desde o envio)</h3>
      <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["#", "mensagem", "1ª ação", "1º áudio", "script_done", "turn_done", "servidor (llm 1º token / 1ª ação / tts 1º byte)"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "2px 8px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.turn}>
              <td style={{ padding: "2px 8px" }}>{s.turn}</td>
              <td style={{ padding: "2px 8px" }}>{s.label}</td>
              <td style={{ padding: "2px 8px", color: s.first_action_ms !== undefined && s.first_action_ms > 1500 ? "#c2410c" : undefined }}>{s.first_action_ms ?? "…"}</td>
              <td style={{ padding: "2px 8px" }}>{s.first_audio_ms ?? (modality === "voice" ? "…" : "-")}</td>
              <td style={{ padding: "2px 8px" }}>{s.script_done_ms ?? "…"}</td>
              <td style={{ padding: "2px 8px" }}>{s.turn_done_ms ?? "…"}</td>
              <td style={{ padding: "2px 8px" }}>
                {s.server ? `${s.server.llm_first_token_ms ?? "-"} / ${s.server.first_action_ms ?? "-"} / ${s.server.tts_first_byte_ms ?? "-"}` : "…"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, opacity: 0.6 }}>
        Use fones de ouvido (a voz do tutor não pode disparar a interrupção). Clique num elemento do quadro (ou selecione um trecho) antes de perguntar para testar o “clicar e perguntar”.
        Quando houver uma pergunta aberta no quadro, a próxima fala vira a resposta dela (e passa pelo juiz).
      </p>
    </main>
  );
}
