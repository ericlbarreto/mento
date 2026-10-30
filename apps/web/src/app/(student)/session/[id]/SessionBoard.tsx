"use client";

// Client side of the whiteboard: mounts the board and plays the tutor's turns from the API.
// Captions, chat and the orb are later tracks; this shows a plain caption line and the error state.
import { Board, type TurnRequest, useTurnPlayer } from "@mento/board";
import { Button } from "@mento/ui";
import { useEffect, useRef } from "react";
import { streamTurn } from "@/lib/api";

type TurnInput = Omit<TurnRequest, "interrupted">;

export function SessionBoard({ sessionId, topic }: { sessionId: string; topic?: string }) {
  const player = useTurnPlayer({ sessionId, streamTurn });
  const { sendTurn } = player;
  const lastRequest = useRef<TurnInput | null>(null);
  const started = useRef(false);

  const send = (req: TurnInput) => {
    lastRequest.current = req;
    void sendTurn(req);
  };

  // First turn, once: the ref survives StrictMode's simulated remount, so only one request goes out.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const first: TurnInput = {
      appended: [{ name: "user_message", kind: "chat", text: topic || "Vamos começar!" }],
      modality: "text",
    };
    lastRequest.current = first;
    void sendTurn(first);
  }, [sendTurn, topic]);

  const thinking = player.queueState === "thinking";

  return (
    <main className="flex h-dvh flex-col bg-(--paper)">
      <Board store={player.store} className="min-h-0 flex-1" />
      <footer className="flex min-h-16 items-center justify-center border-t border-(--line) px-6 py-3" aria-live="polite">
        {player.error ? (
          <div role="alert" className="flex flex-wrap items-center justify-center gap-3 text-(--ink)">
            <span>Não consegui falar com o tutor.</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => lastRequest.current && send(lastRequest.current)}
            >
              Tentar de novo
            </Button>
          </div>
        ) : (
          <p className="max-w-[70ch] text-center text-lg text-(--ink)">
            {thinking ? <span className="text-(--ink-soft)">Pensando…</span> : player.caption?.text}
          </p>
        )}
      </footer>
    </main>
  );
}
