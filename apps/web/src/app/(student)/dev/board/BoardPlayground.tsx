"use client";

// Replays fixtures locally (no API, whatever NEXT_PUBLIC_MOCK_API says): the "message" text is the fixture name.
import {
  Board,
  FIXTURE_TURNS,
  type FixtureName,
  type QueueState,
  type StreamTurn,
  replayFixture,
  useTurnPlayer,
} from "@mento/board";
import { Badge, Button } from "@mento/ui";
import { useEffect, useState } from "react";

const fixtureNames = Object.keys(FIXTURE_TURNS) as FixtureName[];

const isFixture = (name: string): name is FixtureName => name in FIXTURE_TURNS;

const replayStream: StreamTurn = (_sessionId, req, opts) => {
  const first = req.appended[0];
  const name = first?.name === "user_message" ? first.text : "";
  return replayFixture(isFixture(name) ? FIXTURE_TURNS[name] : [], opts?.signal);
};

const stateLabel: Record<QueueState, string> = {
  idle: "Parado",
  thinking: "Pensando",
  playing: "Tocando",
  waiting_answer: "Esperando resposta",
  paused: "Pausado",
};

export function BoardPlayground() {
  const player = useTurnPlayer({ sessionId: "dev", streamTurn: replayStream });
  const [lastInterrupted, setLastInterrupted] = useState<string | null>(null);
  // Fixtures reference this app's /brand files.
  const [assetBaseUrl, setAssetBaseUrl] = useState("");
  useEffect(() => setAssetBaseUrl(window.location.origin), []);

  const play = (name: FixtureName) =>
    void player.sendTurn({ appended: [{ name: "user_message", kind: "chat", text: name }], modality: "text" });

  return (
    <main className="flex h-dvh flex-col bg-(--paper)">
      <header className="flex flex-wrap items-center gap-2 border-b border-(--line) px-6 py-3">
        <strong className="mr-2">Quadro (dev)</strong>
        {fixtureNames.map((name) => (
          <Button key={name} size="sm" variant="secondary" onClick={() => play(name)}>
            {name}
          </Button>
        ))}
        <span className="mx-2 h-6 w-px bg-(--line)" aria-hidden />
        {player.queueState === "paused" ? (
          <Button size="sm" onClick={player.resume}>
            Continuar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={player.pause}>
            Pausar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const payload = player.interrupt();
            setLastInterrupted(payload ? JSON.stringify(payload) : "nada para interromper");
          }}
        >
          Interromper
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            player.clear();
            setLastInterrupted(null);
          }}
        >
          Limpar
        </Button>
        <Badge tone="info" className="ml-auto" data-testid="queue-state">
          {stateLabel[player.queueState]}
        </Badge>
      </header>

      <Board store={player.store} assetBaseUrl={assetBaseUrl} onWarning={player.warn} className="min-h-0 flex-1" />

      <footer className="grid gap-2 border-t border-(--line) px-6 py-3 text-sm md:grid-cols-2">
        <div>
          <p className="font-bold text-(--ink-soft)">Legenda</p>
          <p className="text-base" data-testid="caption">
            {player.caption?.text ?? "—"}
            {player.caption?.outside_material && <Badge tone="warning" className="ml-2">Fora do material</Badge>}
            {player.caption?.sources?.map((s, i) => (
              <Badge key={i} className="ml-2">Livro · p.{s.page}</Badge>
            ))}
          </p>
          {lastInterrupted && <p className="mt-1 font-mono text-xs text-(--ink-soft)">interrupted: {lastInterrupted}</p>}
          {player.error && <p className="mt-1 text-(--accent-ink)">Erro: {player.error}</p>}
        </div>
        <div>
          <p className="font-bold text-(--ink-soft)">Avisos ({player.warnings.length})</p>
          <ul className="max-h-24 overflow-y-auto font-mono text-xs text-(--ink-soft)" data-testid="warnings">
            {player.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </footer>
    </main>
  );
}
