"use client";

// Owner: Person 2. Everything the session page does with the API, independent of layout (plan 2026-10-30-2330
// §3 S2–S4): load and replay the session, send the opening turn once, send student messages (chat,
// click-and-ask, verification answers) with interruption, and expose what the UI shows (transcript, speaking
// line, open question, orb state). The API calls are injected, like useTurnPlayer's streamTurn, so tests and
// the mock mode use the same code.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, SessionDetailResponse, SessionSummary, SpeechPlayer, TurnRequest, WordTiming } from "@mento/contracts";
import {
  type ActionHandler,
  type HandlerMap,
  type StreamTurn,
  type TranscriptLine,
  TextSpeechPlayer,
  defaultHandlers,
  replayEvents,
  useTurnPlayer,
} from "@mento/board";
import type { OrbState } from "@mento/ui";
import {
  type Appended,
  type BoardSelection,
  type OpenQuestion,
  type SessionErrorView,
  buildAppended,
  describeError,
  openingDelayMs,
} from "./sessionModel";

export interface SessionApi {
  getSession(id: string): Promise<SessionDetailResponse>;
  streamTurn: StreamTurn;
}

/** Loading → (preparing: opening turn sent, nothing played yet) → ready. Load failures show `loadError`. */
export type SessionPhase = "loading" | "preparing" | "ready";

export interface ChatLine extends TranscriptLine {
  id: string;
  /** Tutor lines played live: the speak's action id (for "Falando agora…"). */
  action_id?: string;
  outside_material?: boolean;
}

type TurnInput = Omit<TurnRequest, "interrupted">;

/** Text until TTS is configured (plan §8 Q5); the voice track (N2) switches this per session. */
const MODALITY: TurnRequest["modality"] = "text";

/**
 * Sessions whose opening turn this page already sent. Module-level so a remount (StrictMode, fast refresh,
 * back/forward) never sends it twice; an explicit retry bypasses it.
 */
const openingSent = new Set<string>();

/** Wraps every default handler so the page knows which action is playing (speak vs. drawing on the board). */
function trackHandlers(onStart: (a: Action) => void, onEnd: (a: Action) => void): HandlerMap {
  const out: Record<string, ActionHandler> = {};
  for (const [name, handler] of Object.entries(defaultHandlers) as [string, ActionHandler][]) {
    out[name] = async (action, ctx) => {
      onStart(action);
      try {
        await handler(action, ctx);
      } finally {
        onEnd(action);
      }
    };
  }
  return out as HandlerMap;
}

export function useSessionController({
  sessionId,
  api,
  audio,
  openingDelay = openingDelayMs,
}: {
  sessionId: string;
  api: SessionApi;
  /** Tutor voice for `speak.audio_url` (absent in mock mode). */
  audio?: SpeechPlayer;
  /** ms to wait before the opening turn, from the session's started_at (tests pass () => 0). */
  openingDelay?: (startedAt: string | undefined) => number;
}) {
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [loadError, setLoadError] = useState<SessionErrorView | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [openQuestion, setOpenQuestion] = useState<OpenQuestion | null>(null);
  const [answered, setAnswered] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  /** A turn error the student closed ("Tentar de novo" when re-sending would draw twice). */
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  /** The error thrown by the last turn request (ApiError before the stream), to tell 503 from 404 on screen. */
  const lastTurnError = useRef<unknown>(undefined);
  const streamTurn = useCallback<StreamTurn>(async (id, req, onMessage, opts) => {
    lastTurnError.current = undefined;
    try {
      await apiRef.current.streamTurn(id, req, onMessage, opts);
    } catch (err) {
      lastTurnError.current = err;
      throw err;
    }
  }, []);

  const speakStartedAt = useRef(0);
  const speakingRef = useRef<string | null>(null);
  const alignments = useRef(new Map<string, WordTiming[]>());
  const onActionStart = (action: Action) => {
    setPhase("ready");
    if (action.name === "speak") {
      speakingRef.current = action.id;
      speakStartedAt.current = performance.now();
      setSpeakingId(action.id);
      const { text, sources, outside_material } = action.args;
      setLines((ls) =>
        ls.some((l) => l.action_id === action.id)
          ? ls
          : [...ls, { id: action.id, action_id: action.id, role: "tutor", text, at: new Date().toISOString(), sources, outside_material }],
      );
    } else if (action.name === "ask_verification") {
      setOpenQuestion({ verification_id: action.args.verification_id, element_id: action.args.id });
    }
  };
  const onActionEnd = (action: Action) => {
    if (action.name !== "speak" || speakingRef.current !== action.id) return;
    speakingRef.current = null;
    setSpeakingId(null);
  };
  const tracked = useRef({ onActionStart, onActionEnd });
  useEffect(() => {
    tracked.current = { onActionStart, onActionEnd };
  });

  // Created once (useTurnPlayer reads these at creation).
  const [speech] = useState(() => new TextSpeechPlayer());
  const [handlers] = useState(() =>
    trackHandlers(
      (a) => tracked.current.onActionStart(a),
      (a) => tracked.current.onActionEnd(a),
    ),
  );
  const player = useTurnPlayer({
    sessionId,
    streamTurn,
    speech,
    audio,
    handlers,
    onAlignment: (id, words) => alignments.current.set(id, words),
  });
  const { sendTurn, restore, store } = player;

  const lastRequest = useRef<TurnInput | null>(null);
  const send = useCallback(
    (req: TurnInput) => {
      lastRequest.current = req;
      speakingRef.current = null;
      setSpeakingId(null);
      // sendTurn cuts a running turn first (stop speech, abort the fetch, keep the board) and adds `interrupted`.
      void sendTurn(req);
    },
    [sendTurn],
  );

  const sendOpening = useCallback(
    (force = false) => {
      if (!force && openingSent.has(sessionId)) return;
      openingSent.add(sessionId);
      send({ modality: MODALITY, appended: [] });
    },
    [send, sessionId],
  );

  // Survives StrictMode's simulated unmount (the cleanup runs, then the effect again, synchronously).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setPhase("loading");
    let detail: SessionDetailResponse;
    try {
      detail = await apiRef.current.getSession(sessionId);
    } catch (err) {
      if (mounted.current) setLoadError(describeError(err));
      return;
    }
    if (!mounted.current) return;
    // Reopen: redraw without animation or audio, rebuild the chat, reopen the pending question.
    const replay = replayEvents(detail.events);
    restore(replay.actions, replay.lastTurnId);
    setSession(detail.session);
    setLines(replay.transcript.map((line, i) => ({ ...line, id: `replay_${i}` })));
    setOpenQuestion(replay.openVerification && { verification_id: replay.openVerification.verification_id, element_id: replay.openVerification.element_id });
    // `session_started` always exists, so "no events" is the wrong test: only a session the tutor never spoke in
    // gets the opening turn. Ended sessions stay continuable (draft D62): the next turn reopens them.
    if (replay.tutorActionCount > 0) {
      setPhase("ready");
      return;
    }
    setPhase("preparing");
    setTimeout(() => {
      if (mounted.current) sendOpening();
    }, openingDelay(detail.session.started_at));
  }, [openingDelay, restore, sendOpening, sessionId]);

  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    void load();
  }, [load]);

  /** Sends what the student wrote (or answered on the board) as the next turn, cutting the tutor if needed. */
  const commit = (appended: Appended, text: string, via: "text" | "voice") => {
    setLines((ls) => [...ls, { id: `student_${Date.now()}_${ls.length}`, role: "student", text, at: new Date().toISOString(), via }]);
    if (appended.name === "verification_answer") {
      const { element_id, answer } = appended;
      setAnswered((m) => new Map(m).set(element_id, answer));
      setOpenQuestion(null);
    }
    setSelection(null);
    send({ modality: MODALITY, appended: [appended] });
  };

  const sendMessage = (text: string, kind: "chat" | "speech" = "chat"): boolean => {
    const body = text.trim();
    if (!body) return false;
    commit(buildAppended(body, { selection, openQuestion, kind }), body, kind === "speech" ? "voice" : "text");
    return true;
  };

  const answerQuestion = (a: { element_id: string; verification_id: string; answer: string }) => {
    commit({ name: "verification_answer", ...a }, a.answer, "text");
  };

  /**
   * "Tentar de novo": reload a failed load; re-send the opening turn only while nothing is on the board, or the
   * student's last message; otherwise (an opening that already drew something) just close the error.
   */
  const retry = (): "reloaded" | "resent" | "dismissed" => {
    if (loadError) {
      void load();
      return "reloaded";
    }
    const boardEmpty = store.getState().elements.size === 0;
    if (phase === "preparing" && boardEmpty) {
      sendOpening(true);
      return "resent";
    }
    if (phase === "ready" && lastRequest.current && lastRequest.current.appended.length > 0) {
      send(lastRequest.current);
      return "resent";
    }
    setPhase("ready");
    setDismissedError(player.error);
    return "dismissed";
  };

  /** 0..1 share of the caption already spoken: alignment timings in voice, the text clock otherwise. */
  const captionProgress = useCallback(
    (action_id: string): number => {
      if (speakingRef.current !== action_id) return 1;
      const words = alignments.current.get(action_id);
      if (words?.length) {
        const elapsed = performance.now() - speakStartedAt.current;
        return words.filter((w) => w.start_ms <= elapsed).length / words.length;
      }
      return speech.progress();
    },
    [speech],
  );

  const turnError = player.error && player.error !== dismissedError ? describeError(lastTurnError.current, player.error) : null;
  const { queueState } = player;
  const annotating = phase === "ready" && queueState === "playing" && speakingId === null;
  const orbState: OrbState =
    phase !== "ready"
      ? "loading"
      : queueState === "paused"
        ? "paused"
        : speakingId
          ? "speaking"
          : queueState === "thinking" || queueState === "playing"
            ? "thinking"
            : openQuestion || queueState === "waiting_answer"
              ? "waiting"
              : "idle";

  return {
    phase,
    loadError,
    turnError,
    session,
    lines,
    speakingId,
    annotating,
    orbState,
    openQuestion,
    answered,
    selection,
    setSelection,
    sendMessage,
    answerQuestion,
    retry,
    captionProgress,
    /** Orb ring level while speaking (voice output, else the text clock's pseudo-level). */
    level: () => (speakingRef.current ? Math.max(audio?.level() ?? 0, speech.level()) : 0),
    player,
  };
}

export type SessionController = ReturnType<typeof useSessionController>;
