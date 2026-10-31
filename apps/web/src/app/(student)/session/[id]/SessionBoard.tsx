"use client";

// Client side of the whiteboard: mounts the board and plays the tutor's turns from the API.
// Captions, chat and the orb are later tracks; this shows a plain caption line and the error state.
import type { TurnRequest } from "@mento/contracts";
import { Board, useTurnPlayer } from "@mento/board";
import { Button } from "@mento/ui";
import { useEffect, useRef, useState } from "react";
import { API_URL, MOCK_API, streamTurn } from "@/lib/api";

type TurnInput = Omit<TurnRequest, "interrupted">;

export function SessionBoard({ sessionId, topic }: { sessionId: string; topic?: string }) {
  const player = useTurnPlayer({ sessionId, streamTurn });
  const { sendTurn } = player;
  const lastRequest = useRef<TurnInput | null>(null);
  const started = useRef(false);
  // Generated images come from the API; in mock mode the fixtures point at this app's /brand files.
  const [assetBaseUrl, setAssetBaseUrl] = useState(MOCK_API ? "" : API_URL);
  useEffect(() => {
    if (MOCK_API) setAssetBaseUrl(window.location.origin);
  }, []);

  const send = (req: TurnInput) => {
    lastRequest.current = req;
    void sendTurn(req);
  };

  // First turn, once: the ref survives StrictMode's simulated remount, so only one request goes out.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Opening turn: no student message; the tutor starts from the session (topic set at createSession).
    const first: TurnInput = { modality: "text", appended: [] };
    lastRequest.current = first;
    void sendTurn(first);
  }, [sendTurn]);

  const thinking = player.queueState === "thinking";

  return (
    <main className="flex h-dvh flex-col bg-(--paper)">
      {topic && (
        <header className="border-b border-(--line) px-6 py-2 text-sm text-(--ink-soft)">
          Tema: <span className="font-semibold text-(--ink)">{topic}</span>
        </header>
      )}
      <Board store={player.store} assetBaseUrl={assetBaseUrl} onWarning={player.warn} className="min-h-0 flex-1" />
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
