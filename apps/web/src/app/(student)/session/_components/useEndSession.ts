"use client";

// Owner: Person 2. End-of-conversation lifecycle (decision D63): the student ends it explicitly, or the tab is
// closed. There is no client idle timer; the server ends a session after 60 min idle. Ends at most once per mount.
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
  /** The tab-close request went out for the current hidden period. */
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

  // Tab close: the page turns hidden. A refresh also unloads the page, and until resume after end (D62) lands
  // that would end the session too, so the request goes only on visibilitychange → hidden while this app is not
  // navigating. It uses fetch keepalive (reason "beacon"), which outlives the page.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Back on the tab (or from the bfcache): a later close must be able to fire again.
        navigating.current = false;
        closeSent.current = false;
        return;
      }
      if (ended.current || closeSent.current || navigating.current) return;
      closeSent.current = true;
      void latest.current.end(sessionId, "beacon", { keepalive: true }).catch(() => undefined);
    };
    // Same-origin link clicks are navigations within the app, not a tab close.
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin && !link.target) navigating.current = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
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
