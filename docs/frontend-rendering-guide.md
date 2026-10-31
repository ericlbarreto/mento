# Front-end rendering guide (whiteboard)

> For Person 2 (whiteboard front-end). How to turn what the API sends into the screen: the board, the speech, the captions, the orb, the microphone and a re-opened session.
> Companion of `docs/frontend-integration.md`, which lists every route and message. This file is about **rendering**.
> Every shape below comes from `@mento/contracts` (`packages/contracts/src/actions.ts`, `stream.ts`, `sessions.ts`). A working reference is `apps/web/src/app/dev/conversation/page.tsx` (`/dev/conversation`).
> Status (2026-10-30): the API side is implemented and tested; the code in this guide is a recommended structure, not code that exists in `apps/web` yet.

## 1. The screen

```
┌───────────────────────────────────────────────────────────────────────────┐
│  header: logo · subject name · "Encerrar"                                  │
├────────────────────────────┬───────────────────────┬──────────────────────┤
│  main (≈50%)               │  visuals (≈30%)       │  side (≈20%)         │
│  titles, explanations,     │  images, timelines    │  notes, options,     │
│  questions                 │                       │  summaries           │
│  (elements stack top→down, newest at the bottom, auto-scroll)             │
├───────────────────────────────────────────────────────────────────────────┤
│  captions (word by word)  ·  source chips                                  │
│  [pause] [volume]            ( orb + mascot )            [teclado] [mic]   │
└───────────────────────────────────────────────────────────────────────────┘
```

- Board background `#FBF7EE` (beige paper), cards `#FFFDF8`, brand blue `#1E59ED` (orb ring, buttons). Board text in a handwriting font (Caveat or Kalam; check pt-BR accents). See `docs/18-ui-references.md` and `docs/19-brand-assets.md`.
- The server never sends coordinates. Each element has a `column` (`main` | `visuals` | `side`) and is appended to the end of that column. On a phone, stack the three columns.
- Every element is rendered with `data-element-id={id}`. Later actions (`highlight`, `circle_annotate`, `update_element`, `remove_element`, `draw_result`) and click-and-ask use that id.

## 2. The state you keep

```ts
import type { Action, Citation, StreamMessage, WordTiming } from "@mento/contracts";

type Column = "main" | "visuals" | "side";

type BoardElement = {
  id: string;
  column: Column;
  kind: "text" | "timeline" | "image" | "question";
  html?: string;                                   // text
  events?: { date: string; label: string }[];      // timeline
  prompt?: string; width?: number; height?: number; url?: string; // image (url arrives later)
  question?: string; verification_id?: string; verificationKind?: string; // question
  highlight?: "yellow" | "green" | "pink" | "blue";
  circles: { text: string; color: "red" | "blue" | "green" }[];
  sources?: Citation[];
  outside?: boolean;                               // answered outside the teacher's material
  appearing?: boolean;                             // true for ~600 ms: handwriting animation
};

type Board = BoardElement[];                       // order = order of creation
```

Plus, outside the board: the **playback queue** of actions, the **current caption** (`text`, `words`, how many words were spoken), the **orb state**, the **open question** (`verification_id`, `element_id`) and the **last `turn_id`**.

## 3. Applying one action to the board

A pure reducer. Use it for live turns **and** for re-opened sessions (§9).

```ts
export function applyAction(board: Board, action: Action, apiUrl: string): Board {
  const a = action.args as any;
  switch (action.name) {
    case "write_text":
      return [...board, { id: a.id, column: a.column, kind: "text", html: a.html, sources: a.sources, outside: a.outside_material, circles: [], appearing: true }];
    case "write_timeline":
      return [...board, { id: a.id, column: a.column, kind: "timeline", events: a.events, circles: [], appearing: true }];
    case "draw":
      return [...board, { id: a.id, column: a.column, kind: "image", prompt: a.prompt, width: a.max_dimensions.w, height: a.max_dimensions.h, circles: [] }];
    case "draw_result":
      return board.map((e) => (e.id === a.element_id ? { ...e, url: `${apiUrl}${a.url}` } : e));
    case "ask_verification":
      return [...board, { id: a.id, column: a.column, kind: "question", question: a.question, verification_id: a.verification_id, verificationKind: a.kind, circles: [], appearing: true }];
    case "highlight":
      return board.map((e) => (e.id === a.target_id ? { ...e, highlight: a.color } : e));
    case "circle_annotate":
      return board.map((e) => (e.id === a.target_id ? { ...e, circles: [...e.circles, { text: a.text_to_match, color: a.color }] } : e));
    case "update_element":
      // also the image fallback: a caption card "[ilustração: …]" replaces a failed picture
      return board.map((e) => (e.id === a.id ? { ...e, kind: "text", html: a.html, url: undefined } : e));
    case "remove_element":
      return board.filter((e) => e.id !== a.id);
    case "speak":
      return board; // speech is not on the board (see §5)
  }
}
```

The server already validated every action against its own copy of the board: targets exist, ids are new, the circled text occurs in the element, citations are real, HTML is sanitized. If a target is missing on your side anyway, ignore the action (never throw).

## 4. Rendering each element

### `write_text`: a handwritten block

`html` is already sanitized on the server (only `h1–h3, p, b, i, br, ul, ol, li, span`, no attributes), so `dangerouslySetInnerHTML` is safe here. Circles are applied by wrapping the matched text (§4.5).

```tsx
function TextBlock({ el }: { el: BoardElement }) {
  return (
    <div data-element-id={el.id} className={`card ${el.appearing ? "write-in" : ""} ${el.highlight ? `hl-${el.highlight}` : ""}`}>
      <div className="handwriting" dangerouslySetInnerHTML={{ __html: withCircles(el.html!, el.circles) }} />
      {el.outside && <span className="badge-outside">fora do material</span>}
      <SourceChips sources={el.sources} />
    </div>
  );
}
```

```css
.handwriting { font-family: "Caveat", "Kalam", cursive; font-size: 1.35rem; line-height: 1.35; color: #1f2937; }
.handwriting h2, .handwriting h3 { font-size: 1.6rem; margin: 0 0 .25rem; color: #1E59ED; }
.write-in { animation: write-in 600ms ease-out both; }
@keyframes write-in { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }   /* left-to-right "writing" */
```

### `write_timeline`

```tsx
function Timeline({ el }: { el: BoardElement }) {
  return (
    <ol data-element-id={el.id} className={`card timeline ${el.highlight ? `hl-${el.highlight}` : ""}`}>
      {el.events!.map((ev, i) => (
        <li key={i} style={{ animationDelay: `${i * 150}ms` }} className="timeline-item">
          <b className="handwriting">{ev.date}</b> <span className="handwriting">{withCirclesText(ev.label, el.circles)}</span>
        </li>
      ))}
    </ol>
  );
}
```

Draw a vertical line with dots (`border-left` on the `ol`, a `::before` dot on each `li`). Events come in chronological order; dates are free text such as `"44 a.C."`.

### `draw` → `draw_result`: image with a placeholder

`draw` arrives with the size; the picture arrives seconds later in `draw_result` (often after `script_done`). Never wait for it.

```tsx
function ImageBlock({ el }: { el: BoardElement }) {
  const style = { aspectRatio: `${el.width} / ${el.height}`, maxWidth: el.width };
  return (
    <figure data-element-id={el.id} className="card image" style={style}>
      {el.url
        ? <img src={el.url} alt={el.prompt} className="fade-in" style={{ mixBlendMode: "multiply" }} />  // white background disappears on the beige board
        : <div className="sketching">desenhando…</div>}                                                       // soft pencil-shimmer placeholder
    </figure>
  );
}
```

Images are served by `GET /api/gen/<key>.jpg` with long cache headers. If the image fails, the server sends `update_element` with a caption card, and the reducer turns the element into text.

### `ask_verification`: a question on the board

```tsx
function QuestionBlock({ el, open }: { el: BoardElement; open: boolean }) {
  return (
    <div data-element-id={el.id} className={`card question ${open ? "pulse" : "answered"}`}>
      <span className="question-label">Pergunta</span>
      <p className="handwriting">{el.question}</p>
      {open && <small>Responda falando ou digitando</small>}
    </div>
  );
}
```

When it is applied, set the open question to `{ verification_id, element_id: id }`. The **next** student message is the answer (§7).

### 4.5 `highlight` and `circle_annotate`

- `highlight` colors the whole element: `.hl-yellow { background: linear-gradient(transparent 55%, #fde68a 55%); }` (marker look) and the same for green `#bbf7d0`, pink `#fbcfe8`, blue `#bfdbfe`. Animate it in (`background-size` from 0 to 100%).
- `circle_annotate` circles a piece of text inside the element (case-insensitive; the server guarantees it occurs). Wrap the first match:

```ts
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function withCircles(html: string, circles: BoardElement["circles"]): string {
  return circles.reduce((out, c) => {
    // match only in text, not inside tags
    const re = new RegExp(`(>[^<]*?)(${escapeRe(c.text)})`, "i");
    return (">" + out).replace(re, `$1<span class="circle circle-${c.color}">$2</span>`).slice(1);
  }, html);
}
// for plain strings (timeline labels): split on the match and wrap it in <span className="circle …">
```

```css
.circle { position: relative; padding: 0 .15em; }
.circle::after { content: ""; position: absolute; inset: -.25em -.35em; border: 2.5px solid currentColor; border-radius: 50%;
  transform: rotate(-2deg); animation: draw-circle 500ms ease-out both; }
.circle-red::after { color: #dc2626; } .circle-blue::after { color: #1E59ED; } .circle-green::after { color: #16a34a; }
@keyframes draw-circle { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
```

### Source chips and the "outside material" badge

```tsx
function SourceChips({ sources }: { sources?: Citation[] }) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      {sources.map((s, i) => (
        <button key={i} className="chip" title={`“${s.quote}”`} onClick={() => openSource(s.material_id, s.page)}>📖 p.{s.page}</button>
      ))}
    </div>
  );
}
```

- Material title: from `GET /api/subjects` (`materials[].id` / `title`) to show "Livro X, p. 392".
- `outside_material: true` must be visible (rule 7 of `AGENTS.md`): a small "fora do material" badge on the element or the caption.

## 5. Playing the script: `speak` is the clock

Actions arrive faster than they can be shown. Put every `action` message in a queue and play it in `order`. Board actions are applied at once; a `speak` blocks the queue until its audio ends. That is what makes the board appear **while** the tutor talks about it (speak → block appears → next speak explains it).

```ts
const player = new PcmPlayer();            // from "@mento/voice/client"
const queue: Action[] = [];
let working = false;
const words = new Map<string, WordTiming[]>(); // speech_alignment by action id

async function work() {
  if (working) return;
  working = true;
  while (queue.length) {
    const action = queue.shift()!;
    if (action.name !== "speak") { setBoard((b) => applyAction(b, action, API)); continue; }
    const { text, audio_url, sources, outside_material, purpose } = action.args;
    setCaption({ action_id: action.id, text, spoken: 0, sources, outside: outside_material });
    addTranscriptLine("tutor", text, sources);
    setOrb("speaking");
    if (audio_url) {
      player.setWords(words.get(action.id) ?? []);
      await player.play(`${API}${audio_url}`, turnAbort.signal).catch(() => {});  // resolves when the audio ends
    } else {
      await sleep(Math.min(2500, 250 + text.length * 25));                         // text mode: time to read
    }
  }
  working = false;
  setCaption(null);
  if (scriptDone) onScriptFinished();        // §6
}

function onMessage(m: StreamMessage) {
  switch (m.type) {
    case "action":
      if (m.action.name === "draw_result") setBoard((b) => applyAction(b, m.action, API)); // late image: show at once
      else { queue.push(m.action); void work(); }
      if (orb === "thinking") setOrb("speaking");
      break;
    case "speech_alignment":
      words.set(m.action_id, m.words);
      if (caption?.action_id === m.action_id) player.setWords(m.words);   // may arrive after the audio started
      break;
    case "script_done": lastTurnId = m.turn_id; scriptDone = true; if (!working) onScriptFinished(); break;
    case "turn_done":   /* late images are done; nothing to show */ break;
    case "error":       showToast(m.message); setOrb("idle"); break;  // if m.recoverable, let the student retry
  }
}
```

Read the stream with `runTurn` from `docs/frontend-integration.md` §8 (`fetch` + `ReadableStream`; `EventSource` cannot POST).

### Captions, word by word

```ts
useEffect(() => player.onWord(() => setCaption((c) => (c ? { ...c, spoken: c.spoken + 1 } : c))), [player]);
```

```tsx
<p className="caption">
  {caption.text.split(/\s+/).map((w, i) => <span key={i} className={i < caption.spoken ? "said" : "unsaid"}>{w} </span>)}
</p>
```

`.unsaid { opacity: .45 }`. The tutor's caption sits above the orb; its source chips go next to it.

## 6. The orb and the microphone

| Orb state | When |
|---|---|
| `thinking` | right after sending a turn, until the first `action` |
| `speaking` | while a `speak` plays; ring amplitude from `player.level()` (0..1) every animation frame |
| `waiting` | after an `ask_verification` (soft pulse) |
| `listening` | mic open; ring from the mic level; label "ouvindo" |
| `idle` / `muted` | nothing happening / mic off |

The tutor starts every turn within ~2 s; if nothing arrives in 3 s the server itself says a bridge line ("Deixa eu pensar um instante…").

**Microphone** (`useStt` from `@mento/voice/client`, Deepgram in the browser):

```ts
const stt = useStt({
  getToken: async () => VoiceTokenResponse.parse(await (await fetch(`${API}/api/voice/token`, { method: "POST" })).json()),
  onSpeechStarted: () => { if (tutorBusy()) interrupt(); },   // barge-in (§8)
  onFinal: (c) => sendStudent(c.text, "speech"),              // the full utterance
});
// stt.state: idle | connecting | listening | muted | error ; stt.caption: interim text to show live
```

- Start it when the session starts (voice mode). Show `stt.caption.text` live while the student talks (kind `interim`).
- **Without headphones**, mute the mic while the tutor speaks (`stt.setMuted(true)` when a `speak` starts) and unmute in `onScriptFinished()` after the last `speak` ends; otherwise the tutor's voice triggers `onSpeechStarted` and cuts itself. **With headphones**, keep it open for barge-in. Offer a "toque para falar" button either way.
- `onScriptFinished()`: set the orb to `waiting` if a question is open, else `listening`; unmute the mic.

## 7. Sending what the student does

```ts
function sendStudent(text: string, kind: "speech" | "chat") {
  addTranscriptLine("aluno", text);
  let appended;
  if (openQuestion && !selected) {
    appended = [{ name: "verification_answer", verification_id: openQuestion.verification_id, element_id: openQuestion.element_id, answer: text }];
    markAnswered(openQuestion.element_id); openQuestion = null;
  } else if (selected) {
    appended = [{ name: "user_message", kind: "board_select", text, selected }];   // click-and-ask
    selected = null;
  } else {
    appended = [{ name: "user_message", kind, text }];
  }
  void startTurn({ modality, appended, ...(interruptedInfo ? { interrupted: interruptedInfo } : {}) });
}
```

- **Opening turn:** right after `POST /api/sessions`, wait ~0.8 s (prompt cache pre-warm), then send `{ modality, appended: [] }`. The tutor greets and asks what to study.
- **Click-and-ask:** on click or text selection inside an element, store `selected = { element_id, text: window.getSelection()?.toString() || undefined }`, show a small chip "perguntando sobre …", and send it with the next message.
- **Text input:** the keyboard toggle opens an input above the orb; send with `kind: "chat"`.

## 8. Interruption

```ts
function interrupt() {
  const playing = currentSpeak();               // { action_id, text } or null
  turnAbort.abort(); player.stop(); queue.length = 0; setCaption(null);
  interruptedInfo = lastTurnId ? { turn_id: lastTurnId, ...(playing ? { action_id: playing.action_id, spoken_chars: Math.round(playing.text.length / 2) } : {}) } : undefined;
}
```

Keep the board as it is. The next turn carries `interrupted`, and the tutor picks up from there. The server stops the model, the speech synthesis and pending images when the connection closes.

## 9. Re-opening a past session (history)

`GET /api/sessions?student_id=&subject_id=&limit=` lists sessions (title, subject, `turn_count`, dates). `GET /api/sessions/:id` returns `{ session, events }`. Rebuild the screen **without** audio or animations:

```ts
function rebuild(events: { type: string; payload: any }[]) {
  let board: Board = [];
  const transcript: { who: "aluno" | "tutor"; text: string; sources?: Citation[] }[] = [];
  for (const e of events) {
    if (e.type === "tutor_action") {
      const { action_id, name, args } = e.payload;
      board = applyAction(board, { id: action_id, name, args } as Action, API);
      if (name === "speak") transcript.push({ who: "tutor", text: args.text, sources: args.sources });
    } else if (e.type === "user_message") transcript.push({ who: "aluno", text: e.payload.text });
    else if (e.type === "verification_answered") transcript.push({ who: "aluno", text: e.payload.answer });
  }
  return { board: board.map((el) => ({ ...el, appearing: false })), transcript };
}
```

To continue the conversation, keep the same session id and send new turns; the server already knows the history. A read-only viewer (teacher side) can reuse the same `Board` component.

## 10. Checklist before the demo

- [ ] Elements appear in their column with the handwriting animation, newest at the bottom, auto-scroll.
- [ ] Each `speak` plays to the end before the next one; the board block it talks about appears in between.
- [ ] Captions highlight word by word; source chips open the book page; "fora do material" is visible.
- [ ] Image placeholder shows at once; the picture fades in later without moving the layout (fixed aspect ratio).
- [ ] `highlight` and `circle_annotate` animate on the right element.
- [ ] Question card pulses; the next answer goes as `verification_answer`.
- [ ] Orb: thinking → speaking → listening/waiting; mic muted while the tutor speaks without headphones.
- [ ] Interrupting stops audio at once and the tutor continues from there.
- [ ] A past session re-opens with the same board and transcript.
- [ ] Without the API keys: `GET /api/dev/fixture-turn?name=rome-intro&speed=1` replays a turn in the same format.
