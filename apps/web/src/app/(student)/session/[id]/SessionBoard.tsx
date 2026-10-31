"use client";

// Owner: Person 2. The tutoring session (Stitch S2 loading, S3 board + chat, S4 chat closed): composes the shared
// chrome, the PR #6 board, captions, orb, controls and chat around useSessionController. Plan 2026-10-30-2330 §3.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Board, MOCK_STUDENTS, type StudentSummary } from "@mento/board";
import { Footer, Orb, TopBar, type TopBarNavItem } from "@mento/ui";
import { API_URL, MOCK_API, apiUrl, getSession, getVoiceToken, listSessions, listStudents, streamTurn } from "@/lib/api";
import { CaptionBar } from "../_components/caption/CaptionBar";
import { ChatPanel } from "../_components/chat/ChatPanel";
import { InputControls, PlaybackControls } from "../_components/controls/SessionControls";
import { SessionHeader } from "../_components/header/SessionHeader";
import { HistoryDrawer } from "../_components/history/HistoryDrawer";
import { SessionErrorCard, SessionLoading } from "../_components/loading/SessionLoading";
import { SessionPauseModal } from "../_components/pause/SessionPauseModal";
import { type SessionStats, sessionStats } from "../_components/pause/sessionStats";
import { createSessionAudio } from "../_components/sessionAudio";
import { makeSelection, readStudentId } from "../_components/sessionModel";
import { useEndSession } from "../_components/useEndSession";
import { useSessionController } from "../_components/useSessionController";
import { voiceOrbState } from "../_components/voice/turnTaking";
import { useSessionVoice } from "../_components/voice/useSessionVoice";
import { InterimCaption, MicIndicator, VoiceNotice, VoiceStartGate } from "../_components/voice/VoiceUi";

const NAV: TopBarNavItem[] = [
  { label: "Estudos", href: "/", active: true },
  { label: "Atividades", inert: true },
  { label: "Meu Progresso", inert: true },
  { label: "Biblioteca", inert: true },
];

const EMPTY_STATS: SessionStats = { elapsed: null, items: null, reference: null };

/** Stitch's dotted notebook paper. */
const dotted = "bg-[radial-gradient(color-mix(in_srgb,var(--ink-soft)_45%,transparent)_1.2px,transparent_1.2px)] bg-size-[24px_24px]";

export function SessionBoard({ sessionId, onOpenHistory }: { sessionId: string; onOpenHistory?: () => void }) {
  // Tutor voice when the API serves `speak.audio_url` (none in mock mode).
  const [audio] = useState(() => (MOCK_API ? undefined : createSessionAudio(apiUrl)));
  // Voice sessions hold the opening turn until the audio is unlocked (or the student picks text only).
  // Every speak's audio starts downloading as soon as the action arrives (see sessionAudio.prefetch).
  const [api] = useState(() => ({
    getSession,
    streamTurn: ((id, req, onMessage, opts) =>
      streamTurn(
        id,
        req,
        (msg) => {
          if (msg.type === "action" && msg.action.name === "speak" && msg.action.args.audio_url) audio?.prefetch(msg.action.args.audio_url);
          onMessage(msg);
        },
        opts,
      )) as typeof streamTurn,
  }));
  const c = useSessionController({ sessionId, api, audio, holdVoiceOpening: !MOCK_API });
  const { player, session, setSelection, releaseOpening } = c;

  // The spoken conversation: mic + STT, turn-taking, barge-in. Final captions go out like typed messages, so a
  // board selection ("Sobre: …" chip) turns the spoken question into click-and-ask.
  // The echo reference: the tutor's last two lines (the previous one can still be leaking into the mic).
  const tutorText = c.lines
    .filter((l) => l.role === "tutor")
    .slice(-2)
    .map((l) => l.text)
    .join(" ");
  const voice = useSessionVoice({
    enabled: !MOCK_API && session?.modality === "voice",
    audio,
    getToken: getVoiceToken,
    floor: c.tutorHasFloor,
    speakingId: c.speakingId,
    tutorText,
    onFinal: (caption) => c.sendMessage(caption.text, "speech", caption),
    onBargeIn: c.interrupt,
  });
  const canOpen = !!session && voice.canOpen;
  useEffect(() => {
    if (canOpen) releaseOpening();
  }, [canOpen, releaseOpening]);
  const voiceOn = !MOCK_API && session?.modality === "voice";
  const micUsable = voiceOn && voice.status !== "denied" && voice.status !== "unavailable";
  // "Continuar por texto" closes the mic notice and opens the chat (the notice comes back if the mic state changes).
  const [noticeClosedFor, setNoticeClosedFor] = useState<string | null>(null);

  // Leaving the page (tab close / reload) ends the lesson (keepalive, reason "beacon"): that is what sends the
  // conversation to the teacher-side analysis. Coming back reopens it paused (below); there is no end button.
  useEndSession({ sessionId, onEnded: () => undefined });

  // A reopened lesson starts paused: "Retomar conversa" is the click that unlocks the audio and the mic.
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const resumeOpen = c.restored && !resumeDismissed && c.phase === "ready";
  const resume = () => {
    setResumeDismissed(true);
    if (voiceOn) void voice.start();
  };

  // Generated images come from the API; in mock mode the fixtures point at this app's own origin.
  const [assetBaseUrl, setAssetBaseUrl] = useState(MOCK_API ? "" : API_URL);
  useEffect(() => {
    if (MOCK_API) setAssetBaseUrl(window.location.origin);
  }, []);

  // The lesson's own student wins (a direct link or another tab has no stored id); storage is the fallback.
  const [storedStudentId, setStoredStudentId] = useState<string | null>(null);
  useEffect(() => setStoredStudentId(readStudentId()), []);
  const studentId = session?.student_id ?? storedStudentId;
  // Names come from the students route; without it (404), from the mock list. Simulated students carry the badge.
  const [students, setStudents] = useState<{ list: StudentSummary[]; mock: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    listStudents()
      .then((list) => live && setStudents(list ? { list, mock: MOCK_API } : { list: MOCK_STUDENTS, mock: true }))
      .catch(() => live && setStudents({ list: MOCK_STUDENTS, mock: true }));
    return () => {
      live = false;
    };
  }, []);
  const student = students?.list.find((s) => s.id === studentId);

  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const subjectId = session?.subject?.id;
  useEffect(() => {
    if (!studentId || !session) return;
    let live = true;
    listSessions({ student_id: studentId, subject_id: subjectId })
      .then((list) => live && setHistoryCount(list.length))
      .catch(() => live && setHistoryCount(null));
    return () => {
      live = false;
    };
  }, [studentId, session, subjectId]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusChat = useCallback(() => {
    setChatOpen(true);
    // The panel may mount in this render; focus after it.
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  // Click-and-ask: a click (or a text selection) on a board element sets the "Sobre: …" chip.
  const selectFrom = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest("[data-board-control], input, textarea, button, a")) return false;
    const el = target.closest<HTMLElement>("[data-element-id]");
    const id = el?.dataset.elementId;
    if (!el || !id) return false;
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed && sel.anchorNode && el.contains(sel.anchorNode) ? sel.toString() : "";
    setSelection(makeSelection(id, el.innerText || el.textContent || "", selected));
    focusChat();
    return true;
  };
  const onBoardClick = (e: MouseEvent) => {
    selectFrom(e.target);
  };
  const onBoardKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.dataset.elementId && selectFrom(e.target)) e.preventDefault();
  };

  const verification = { openElementId: c.openQuestion?.element_id ?? null, answered: c.answered, onAnswer: c.answerQuestion };

  const toggleMute = () => {
    audio?.setMuted(!muted);
    setMuted(!muted);
  };

  const retry = () => {
    if (c.retry() === "dismissed") focusChat();
  };

  const caption = c.phase === "ready" ? player.caption : null;
  const subjectName = session ? (session.subject?.name ?? "Conversa livre") : "Aula";
  const title = session?.title ?? "Nova conversa";

  return (
    <div className="flex min-h-dvh flex-col bg-(--paper)">
      <TopBar nav={NAV} classLabel="8º ano" studentName={student?.name} />
      <div className="relative flex h-[calc(100dvh-4rem)] min-h-[600px]">
        <main className={`relative flex min-w-0 flex-1 flex-col ${dotted}`}>
          <div className="shrink-0 px-6 pt-4 pb-1">
            <SessionHeader
              subjectName={subjectName}
              title={title}
              historyCount={historyCount}
              onOpenHistory={onOpenHistory ?? (() => setHistoryOpen(true))}
              chatOpen={chatOpen}
              onOpenChat={focusChat}
            />
          </div>
          {/* Click-and-ask listens here (bubbling from the board elements); Enter on a focused element does the same. */}
          <div className="relative min-h-0 flex-1" onClick={onBoardClick} onKeyDown={onBoardKeyDown}>
            <Board
              store={player.store}
              assetBaseUrl={assetBaseUrl}
              onWarning={player.warn}
              verification={verification}
              className={`min-h-0 [&_[data-element-id]]:cursor-pointer [&>section]:pb-72 [&>section]:scroll-pb-72 ${dotted}`}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-5">
              {voiceOn && noticeClosedFor !== voice.status && (
                <VoiceNotice
                  status={voice.status}
                  onText={() => {
                    setNoticeClosedFor(voice.status);
                    focusChat();
                  }}
                />
              )}
              {captionsOn && caption && (
                <CaptionBar caption={caption} speaking={c.speakingId === caption.action_id} progress={c.captionProgress} />
              )}
              {voiceOn && <InterimCaption text={voice.interim} />}
              <div className="flex w-full items-end justify-between gap-4">
                <PlaybackControls
                  muted={muted}
                  onToggleMute={toggleMute}
                  captionsOn={captionsOn}
                  onToggleCaptions={() => setCaptionsOn((on) => !on)}
                />
                {/* In voice sessions the orb mutes / unmutes the mic; otherwise it opens the chat. */}
                <button
                  type="button"
                  onClick={micUsable ? voice.toggleMic : focusChat}
                  aria-label={micUsable ? (voice.status === "listening" ? "Silenciar o microfone" : "Falar com o Mento") : "Escrever para o Mento"}
                  className="pointer-events-auto rounded-full outline-none focus-visible:shadow-(--focus-ring)"
                >
                  <Orb state={voiceOn ? voiceOrbState(c.orbState, voice.status) : c.orbState} size={120} getLevel={c.level} perkKey={c.selection?.element_id} />
                </button>
                <div className="flex items-center gap-3">
                  {voiceOn && <MicIndicator status={voice.status} onToggle={micUsable ? voice.toggleMic : focusChat} />}
                  <InputControls onKeyboard={focusChat} />
                </div>
              </div>
            </div>
          </div>
        </main>
        {chatOpen && (
          <div className="w-[min(400px,40vw)] shrink-0">
            <ChatPanel
              lines={c.lines}
              speakingId={c.speakingId}
              annotating={c.annotating}
              thinking={c.phase === "ready" && player.queueState === "thinking"}
              selection={c.selection}
              onClearSelection={() => setSelection(null)}
              onSend={c.sendMessage}
              error={c.turnError}
              onRetry={retry}
              onCollapse={() => setChatOpen(false)}
              inputRef={inputRef}
            />
          </div>
        )}
        {c.loadError ? (
          <SessionErrorCard error={c.loadError} onRetry={retry} />
        ) : c.phase !== "ready" && c.turnError ? (
          <SessionErrorCard error={c.turnError} onRetry={retry} />
        ) : c.phase !== "ready" ? (
          <SessionLoading stage={c.phase === "loading" ? "opening" : "preparing"} />
        ) : null}
        <SessionPauseModal
          view={resumeOpen ? "paused" : null}
          topic={`${subjectName}: ${title}`}
          stats={resumeOpen ? sessionStats(session?.started_at, player.store.getState(), Date.now(), c.lines) : EMPTY_STATS}
          onResume={resume}
          onRetryEnd={resume}
          onHome={() => (window.location.href = "/")}
          starting={false}
          startError={false}
        />
        {voice.needsTap && !resumeOpen && <VoiceStartGate onStart={() => void voice.start()} onTextOnly={voice.continueWithText} busy={voice.gate === "unlocking"} />}
      </div>
      <Footer />
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        studentId={studentId}
        subject={session?.subject ?? null}
        currentSessionId={sessionId}
        modality={session?.modality}
      />
    </div>
  );
}
