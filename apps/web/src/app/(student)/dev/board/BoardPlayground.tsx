"use client";

// Replays fixtures locally (no API, whatever NEXT_PUBLIC_MOCK_API says) through the real queue and board.
import {
  Board,
  FIXTURE_TURNS,
  type FixtureName,
  type QueueState,
  type StreamTurn,
  replayFixture,
  useTurnPlayer,
} from "@mento/board";
import type { Action, StreamMessage } from "@mento/contracts";
import { Badge, Button } from "@mento/ui";
import { useEffect, useRef, useState } from "react";

const fixtureNames = Object.keys(FIXTURE_TURNS) as FixtureName[];

// Local handwriting checks (not recorded fixtures): long lines that wrap, math text, an update while writing,
// a marker sweep and a circle to interrupt mid-stroke.
const act = (order: number, action: Action, at_ms: number) => ({ at_ms, message: { type: "action", order, action } as StreamMessage });
const HANDWRITING_TURN: { at_ms: number; message: StreamMessage }[] = [
  act(0, { id: "hw_1", name: "write_text", args: { id: "hw_math", column: "main", html: "<h2>Equações</h2><p>Se x² + 3 = 7, então x² = 4 e x = 2 ou x = −2. Metade de 8 é ½ · 8 = 4; a água é H₂O.</p>" } }, 0),
  act(1, { id: "hw_2", name: "speak", args: { text: "Vamos resolver juntos, passo a passo." } }, 50),
  act(2, { id: "hw_3", name: "write_text", args: { id: "hw_long", column: "main", html: "<p>Um texto mais longo quebra em várias linhas no quadro: <b>cada linha</b> é escrita da esquerda para a direita, e a caneta volta para o começo da linha seguinte com um pequeno arco, como uma mão de verdade.</p><ul><li>primeiro item</li><li>segundo item</li></ul>" } }, 100),
  act(3, { id: "hw_4", name: "update_element", args: { id: "hw_long", html: "<p>Um texto mais longo quebra em várias linhas no quadro: <b>cada linha</b> é escrita da esquerda para a direita, e a caneta volta para o começo da linha seguinte com um pequeno arco, como uma mão de verdade.</p><ul><li>primeiro item</li><li>segundo item</li><li>terceiro item (atualizado)</li></ul>" } }, 300),
  act(4, { id: "hw_5", name: "highlight", args: { target_id: "hw_long", color: "yellow" } }, 350),
  act(5, { id: "hw_6", name: "circle_annotate", args: { target_id: "hw_math", text_to_match: "x = 2", color: "blue" } }, 400),
  act(6, { id: "hw_7", name: "speak", args: { text: "Repare na resposta circulada." } }, 450),
  { at_ms: 500, message: { type: "turn_done", turn_id: "hw_turn" } },
];
type TurnName = FixtureName | "handwriting";
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(false);
    const t = setTimeout(() => resolve(true), ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve(false)), { once: true });
  });

const stateLabel: Record<QueueState, string> = {
  idle: "Parado",
  thinking: "Pensando",
  playing: "Tocando",
  waiting_answer: "Esperando resposta",
  paused: "Pausado",
};

export function BoardPlayground() {
  const fixture = useRef<TurnName>("rome-intro");
  // Every board action played so far, for "Reabrir" (restore without animation, like a reopened session).
  const played = useRef<Action[]>([]);
  // Stable: reads the fixture chosen by the last click.
  const [replayStream] = useState(() => {
    const stream: StreamTurn = async (_sessionId, _req, onMessage, opts) => {
      const record = (m: StreamMessage) => {
        if (m.type === "action" && m.action.name !== "speak") played.current.push(m.action);
        onMessage(m);
      };
      const name = fixture.current;
      if (name === "handwriting") {
        let last = 0;
        for (const { at_ms, message } of HANDWRITING_TURN) {
          if (!(await sleep(at_ms - last, opts?.signal))) return;
          last = at_ms;
          record(message);
        }
        return;
      }
      for await (const m of replayFixture(name, { signal: opts?.signal })) record(m);
    };
    return stream;
  });
  const player = useTurnPlayer({ sessionId: "dev", streamTurn: replayStream });
  const [lastInterrupted, setLastInterrupted] = useState<string | null>(null);
  // Fixtures reference this app's /brand files.
  const [assetBaseUrl, setAssetBaseUrl] = useState("");
  useEffect(() => setAssetBaseUrl(window.location.origin), []);

  const play = (name: TurnName) => {
    fixture.current = name;
    void player.sendTurn({ appended: [], modality: "text" });
  };

  return (
    <main className="flex h-dvh flex-col bg-(--paper)">
      <header className="flex flex-wrap items-center gap-2 border-b border-(--line) px-6 py-3">
        <strong className="mr-2">Quadro (dev)</strong>
        {fixtureNames.map((name) => (
          <Button key={name} size="sm" variant="secondary" onClick={() => play(name)}>
            {name}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => play("handwriting")}>
          handwriting
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const actions = [...played.current];
            player.clear();
            played.current = actions;
            player.restore(actions.map((action) => ({ kind: "action" as const, action })), null);
          }}
        >
          Reabrir
        </Button>
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
            played.current = [];
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
