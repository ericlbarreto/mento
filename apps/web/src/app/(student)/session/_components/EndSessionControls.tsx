"use client";

// Owner: Person 2. "Terminar conversa" with an inline confirm, plus the tab-close end (no idle timer, D63).
// Mounted on the session page by a later track; demo at /dev/session-controls.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { SessionEndReason } from "@mento/contracts";
import { Button } from "@mento/ui";
import { useEndSession, type EndSessionFn } from "./useEndSession";

export type EndSessionControlsProps = {
  sessionId: string;
  /** After an explicit end. Default: back to the start screen. */
  onEnded?: (reason: SessionEndReason) => void;
  /** Override for the dev demo page; defaults to the API client's endSession. */
  end?: EndSessionFn;
};

export function EndSessionControls({ sessionId, onEnded, end }: EndSessionControlsProps) {
  const router = useRouter();
  const goHome = () => router.push("/");
  const { endNow } = useEndSession({ sessionId, end, onEnded: onEnded ?? goHome });
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
