"use client";

// Owner: Person 2. End-of-conversation lifecycle (decision D63): the student ends it explicitly, leaves through an
// in-app link, or the tab is closed or reloaded (pagehide). There is no client idle timer; the server ends a session after 60 min idle. Ends at most once per mount.
import { useCallback, useEffect, useRef } from "react";
import type { SessionEndReason } from "@mento/contracts";
import { endSession as apiEndSession } from "@/lib/api";

export type EndSessionFn = typeof apiEndSession;

export function useEndSession({
  sessionId,
  onEnded,
  end = apiEndSession,
}: {
  sessionId: string;
  /** Called after an explicit end succeeds (not after the tab-close request). */
  onEnded: (reason: SessionEndReason) => void;
  /** Injected for the dev demo page; defaults to the API client. */
  end?: EndSessionFn;
}) {
  /** Ended explicitly: nothing else is sent from this mount. */
  const ended = useRef(false);
  /** The tab-close request already went out for this page lifetime. */
  const closeSent = useRef(false);
  /** A navigation started by this app is in progress (not a tab close). */
  const navigating = useRef(false);
  // Latest callbacks without re-subscribing the document listeners on every render.
  const latest = useRef({ onEnded, end });
  useEffect(() => {
    latest.current = { onEnded, end };
  });

  /** Ends the session once. Throws (and allows a retry) if the call fails. */
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

  // Tab close or refresh: `pagehide` (a tab switch only hides the page and never ends the lesson). A refresh is
  // harmless under D62: the next turn reopens the session. The request uses fetch keepalive (reason "beacon"),
  // which outlives the page. Full-page navigations started by this app (same-origin links) are not a close.
  useEffect(() => {
    const onPageHide = () => {
      if (ended.current || closeSent.current || navigating.current) return;
      closeSent.current = true;
      void latest.current.end(sessionId, "beacon", { keepalive: true }).catch(() => undefined);
    };
    // Back from the bfcache: a later close must be able to fire again.
    const onPageShow = () => {
      navigating.current = false;
      closeSent.current = false;
    };
    // A same-origin link that leaves this page ("Voltar ao início") leaves the lesson: it ends it (reason "user_left")
    // so the teacher-side analysis runs. Client-side navigations never fire `pagehide`, so this is the only signal.
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin || link.target) return;
      navigating.current = true;
      if (link.pathname === window.location.pathname || ended.current || closeSent.current) return;
      closeSent.current = true;
      void latest.current.end(sessionId, "user_left", { keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [sessionId]);

  return {
    endNow: (reason: SessionEndReason = "user_left") => endOnce(reason),
    /** Call before a programmatic navigation (router.push, window.location) so it is not taken for a tab close. */
    markNavigating: () => {
      navigating.current = true;
    },
  };
}
