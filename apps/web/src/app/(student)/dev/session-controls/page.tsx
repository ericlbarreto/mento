"use client";

// Owner: Person 2. Dev-only demo of EndSessionControls: a fake session and a log of every endSession call.
// The tab-close request (hidden tab) is kept in sessionStorage so it shows up after coming back or reloading.
import { useEffect, useState } from "react";
import type { SessionEndReason } from "@mento/contracts";
import { Badge, Button, Card } from "@mento/ui";
import { MOCK_API, endSession } from "@/lib/api";
import { EndSessionControls } from "../../session/_components/EndSessionControls";
import type { EndSessionFn } from "../../session/_components/useEndSession";

const FAKE_SESSION_ID = "665f1a2b3c4d5e6f7a8b9e99";
const BEACON_KEY = "mento-dev-last-beacon";

type LogEntry = { at: string; text: string };

const now = () => new Date().toLocaleTimeString("pt-BR");

export default function SessionControlsDemo() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [mountKey, setMountKey] = useState(0);
  const add = (text: string) => setLog((l) => [{ at: now(), text }, ...l]);

  useEffect(() => {
    try {
      const last = sessionStorage.getItem(BEACON_KEY);
      if (last) setLog([{ at: last, text: "Aba escondida: endSession(…, \"beacon\", { keepalive: true })" }]);
      sessionStorage.removeItem(BEACON_KEY);
    } catch {
      // Storage blocked: the beacon log is a convenience only.
    }
  }, []);

  // Logs each call; only reaches the real client in mock mode (the fake id does not exist on a real API).
  const end: EndSessionFn = async (id, reason, opts) => {
    if (opts?.keepalive) {
      try {
        sessionStorage.setItem(BEACON_KEY, now());
      } catch {
        // ignore
      }
    }
    add(`endSession("${id.slice(-4)}", "${reason}"${opts?.keepalive ? ", { keepalive: true }" : ""})`);
    if (MOCK_API) await endSession(id, reason, opts);
  };

  const onEnded = (reason: SessionEndReason) => add(`onEnded("${reason}") — na sessão real, volta para a tela inicial`);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Controles de fim de conversa</h1>
        <Badge>Somente desenvolvimento</Badge>
      </header>

      <Card className="flex flex-col gap-4">
        <p className="text-sm text-(--ink-soft)">
          Sessão fictícia <code className="font-bold text-(--ink)">{FAKE_SESSION_ID}</code>. Não há encerramento por
          inatividade no navegador (o servidor encerra após 60 min). Esconder ou fechar a aba envia o <code>beacon</code>{" "}
          com <code>keepalive</code>, que aparece no registro ao voltar.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <EndSessionControls key={mountKey} sessionId={FAKE_SESSION_ID} onEnded={onEnded} end={end} />
          <Button variant="ghost" size="sm" onClick={() => setMountKey((k) => k + 1)}>
            Reiniciar sessão fictícia
          </Button>
        </div>
      </Card>

      <section aria-labelledby="log-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id="log-heading" className="text-lg font-bold">Registro de chamadas</h2>
          <Button variant="ghost" size="sm" onClick={() => setLog([])} disabled={log.length === 0}>
            Limpar
          </Button>
        </div>
        <ol aria-live="polite" className="flex flex-col gap-2">
          {log.length === 0 && <li className="text-sm text-(--ink-soft)">Nenhuma chamada ainda.</li>}
          {log.map((e, i) => (
            <li key={log.length - i} className="flex gap-3 rounded-(--radius-sm) bg-(--paper-2) px-3 py-2 text-sm">
              <span className="shrink-0 tabular-nums text-(--ink-soft)">{e.at}</span>
              <code className="break-all">{e.text}</code>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
