"use client";

// Owner: Person 2. End-of-conversation lifecycle (workstreams/02 "Start screen and session lifecycle"):
// manual end, idle timeout and tab close (sendBeacon). Ends a session at most once per mount.
import { useCallback, useEffect, useRef } from "react";
import type { SessionEndReason } from "@mento/board";
import { endSession as apiEndSession } from "@/lib/api";

export type EndSessionFn = typeof apiEndSession;

/** Window events that count as student activity for the idle timeout. */
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "input", "wheel", "touchstart"] as const;

export function useEndSession({
  sessionId,
  idleMs,
  paused = false,
  onEnded,
  end = apiEndSession,
}: {
  sessionId: string;
  idleMs: number;
  /** True while the tutor streams or speaks: the idle timer stops and restarts from zero when it turns false. */
  paused?: boolean;
  /** Called after a manual or idle end succeeds (not after the tab-close beacon). */
  onEnded: (reason: SessionEndReason) => void;
  /** Injected for the dev demo page; defaults to the API client. */
  end?: EndSessionFn;
}) {
  const ended = useRef(false);
  // Latest callbacks without re-subscribing the window listeners on every render.
  const latest = useRef({ onEnded, end });
  useEffect(() => {
    latest.current = { onEnded, end };
  });

  /** Ends the session once. Throws (and allows a retry) if a non-beacon call fails. */
  const endOnce = useCallback(
    async (reason: SessionEndReason) => {
      if (ended.current) return;
      ended.current = true;
      try {
        await latest.current.end(sessionId, reason);
      } catch (err) {
        ended.current = false;
        throw err;
      }
      latest.current.onEnded(reason);
    },
    [sessionId],
  );

  // Idle timeout: one timer that re-arms itself for the remaining time instead of resetting on every event.
  useEffect(() => {
    if (paused) return;
    let lastActivity = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const markActive = () => {
      lastActivity = Date.now();
    };
    const check = () => {
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= idleMs) {
        endOnce("idle_timeout").catch(() => {
          // Network hiccup: keep watching; the next idle window tries again.
          lastActivity = Date.now();
          timer = setTimeout(check, idleMs);
        });
        return;
      }
      timer = setTimeout(check, idleMs - idleFor);
    };
    timer = setTimeout(check, idleMs);
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, markActive, { passive: true, capture: true });
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, markActive, { capture: true });
    };
  }, [idleMs, paused, endOnce]);

  // Tab close / navigation away: fire-and-forget beacon, skipped if the session already ended.
  useEffect(() => {
    const onPageHide = () => {
      if (ended.current) return;
      ended.current = true;
      void latest.current.end(sessionId, "beacon", { beacon: true });
    };
    // Back from the bfcache: the page is live again, so a later close or idle end must be able to fire.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) ended.current = false;
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [sessionId]);

  return { endNow: () => endOnce("user_left") };
}
