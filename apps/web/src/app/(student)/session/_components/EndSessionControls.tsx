"use client";

// Owner: Person 2. "Terminar conversa" with an inline confirm, plus the idle timeout and tab-close beacon.
// Mounted on the session page by a later track; demo at /dev/session-controls.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { SessionEndReason } from "@mento/board";
import { Button } from "@mento/ui";
import { useEndSession, type EndSessionFn } from "./useEndSession";

export type EndSessionControlsProps = {
  sessionId: string;
  /** After a manual or idle end. Default: back to the start screen (with a notice after an idle end). */
  onEnded?: (reason: SessionEndReason) => void;
  /** Inactivity window before the session ends on its own. Default: 5 minutes. */
  idleMs?: number;
  /** True while the tutor streams or speaks; the idle timer does not run meanwhile. */
  paused?: boolean;
  /** Override for the dev demo page; defaults to the API client's endSession. */
  end?: EndSessionFn;
};

export function EndSessionControls({ sessionId, onEnded, idleMs = 300_000, paused = false, end }: EndSessionControlsProps) {
  const router = useRouter();
  const goHome = (reason: SessionEndReason) => router.push(reason === "idle_timeout" ? "/?encerrada=inatividade" : "/");
  const { endNow } = useEndSession({ sessionId, idleMs, paused, end, onEnded: onEnded ?? goHome });
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  // Confirm opens on the safe choice ("Continuar"); closing it puts focus back on the trigger.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (returnFocus.current) triggerRef.current?.focus();
    returnFocus.current = false;
  }, [confirming]);

  const cancel = () => {
    returnFocus.current = true;
    setConfirming(false);
    setError(false);
  };

  const confirm = async () => {
    setEnding(true);
    setError(false);
    try {
      await endNow();
    } catch {
      setError(true);
      setEnding(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !ending) cancel();
  };

  if (!confirming) {
    return (
      <Button ref={triggerRef} variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Terminar conversa
      </Button>
    );
  }

  return (
    <div role="group" aria-labelledby="end-confirm-label" onKeyDown={onKeyDown} className="inline-flex flex-wrap items-center gap-2">
      <span id="end-confirm-label" className="text-sm font-bold">
        Terminar agora?
      </span>
      <Button loading={ending} onClick={confirm}>
        Sim, terminar
      </Button>
      <Button ref={keepRef} variant="ghost" disabled={ending} onClick={cancel}>
        Continuar
      </Button>
      {error && (
        <span role="alert" className="text-sm font-semibold text-(--accent-ink)">
          Não deu para terminar. Tente de novo.
        </span>
      )}
    </div>
  );
}
