"use client";

// Owner: Person 2. Paused / ended modal (Stitch S6, plan 2026-10-30-2330 §3 S6): mascot, status pill, title,
// "{Matéria}: {título}", the local stats row and the way out. "Foram salvas" is only said once the end call
// returned 200 ("ended"); while it runs or after it failed the copy makes no such claim.
import { useEffect, useRef, type ReactNode } from "react";
import { Button, IconBookOpen, IconClock, IconPause, IconPencil, IconPlay, IconPlus, IconPower, Modal, cx } from "@mento/ui";
import type { SessionStats } from "./sessionStats";

export type PauseView = "paused" | "ending" | "end_failed" | "ended";

export function SessionPauseModal({
  view,
  topic,
  stats,
  onResume,
  onRetryEnd,
  onHome,
  onNewConversation,
  starting,
  startError,
}: {
  view: PauseView | null;
  /** "{Matéria}: {título}", highlighted in the body. */
  topic: string;
  stats: SessionStats;
  /** Paused (and a failed end): back to the lesson. */
  onResume: () => void;
  onRetryEnd: () => void;
  onHome: () => void;
  /** Absent when a new session cannot be created (no session loaded). */
  onNewConversation?: () => void;
  starting: boolean;
  startError: boolean;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  // The primary button is disabled while the end call runs, which drops focus; put it back once it settles.
  useEffect(() => {
    if (view === "ended" || view === "end_failed") primaryRef.current?.focus();
  }, [view]);
  if (!view) return null;
  const ended = view !== "paused";
  const strong = <strong className="font-bold text-(--mento-blue-strong)">{topic}</strong>;

  const copy: Record<PauseView, { title: string; body: ReactNode }> = {
    paused: { title: "Sua conversa está em pausa", body: <>Você pausou a conversa sobre {strong}. A lousa fica como está.</> },
    ending: { title: "Encerrando a conversa…", body: <>Estamos concluindo a conversa sobre {strong}.</> },
    end_failed: { title: "Encerrar conversa", body: <>A conversa sobre {strong} ainda está aberta.</> },
    ended: {
      title: "Conversa encerrada",
      body: <>Você encerrou a conversa sobre {strong}. As anotações da lousa e suas dúvidas foram salvas.</>,
    },
  };

  const items = [
    { label: "Tempo", value: stats.elapsed, icon: <IconClock className="size-4" /> },
    { label: "Lousa", value: stats.items, icon: <IconPencil className="size-4" /> },
    { label: "Referência", value: stats.reference, icon: <IconBookOpen className="size-4" /> },
  ].filter((s): s is typeof s & { value: string } => s.value !== null);

  return (
    <Modal
      open
      // Escape on "Pausada" resumes; an ended (or ending) lesson has no way back to the board.
      onClose={view === "paused" || view === "end_failed" ? onResume : () => undefined}
      closeOnOverlay={false}
      initialFocusRef={primaryRef}
      header={
        <>
          <span className="flex size-24 items-center justify-center rounded-full bg-(--mento-blue-soft)">
            <img src="/brand/mascot.png" alt="" className="w-16" />
          </span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-(--radius-pill) bg-(--accent-soft) px-3 text-xs font-bold text-(--accent-ink)">
            {ended ? <IconPower className="size-3.5" aria-hidden="true" /> : <IconPause className="size-3.5" aria-hidden="true" />}
            {ended ? "Sessão encerrada" : "Aula pausada"}
          </span>
        </>
      }
      title={copy[view].title}
      description={copy[view].body}
      footer={
        view === "paused" ? (
          <Button ref={primaryRef} size="lg" className="w-full rounded-(--radius-pill)" onClick={onResume}>
            <IconPlay className="size-4" aria-hidden="true" />
            Retomar conversa
          </Button>
        ) : view === "end_failed" ? (
          <>
            <Button variant="secondary" size="lg" className="rounded-(--radius-pill)" onClick={onResume}>
              Voltar à aula
            </Button>
            <Button ref={primaryRef} size="lg" className="rounded-(--radius-pill)" onClick={onRetryEnd}>
              Tentar de novo
            </Button>
          </>
        ) : (
          <>
            {onNewConversation && (
              <Button
                variant="secondary"
                size="lg"
                className="rounded-(--radius-pill)"
                loading={starting}
                disabled={view === "ending"}
                onClick={onNewConversation}
              >
                <IconPlus className="size-4" aria-hidden="true" />
                Nova conversa
              </Button>
            )}
            <Button
              ref={primaryRef}
              size="lg"
              className="rounded-(--radius-pill)"
              loading={view === "ending"}
              disabled={starting}
              onClick={onHome}
            >
              Voltar ao início
            </Button>
          </>
        )
      }
    >
      {items.length > 0 && (
        <dl
          className={cx(
            "grid w-full divide-x divide-(--line) rounded-(--radius-md) border border-(--line) bg-(--mento-blue-soft)/40 py-3",
            items.length === 3 ? "grid-cols-3" : items.length === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {items.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 px-2">
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-(--ink-soft)">{stat.label}</dt>
              <dd className="flex items-center gap-1.5 text-lg font-extrabold text-(--mento-blue-strong)">
                <span aria-hidden="true">{stat.icon}</span>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {view === "end_failed" && (
        <p role="alert" className="text-sm font-semibold text-(--accent-ink)">
          Não conseguimos encerrar, tente de novo.
        </p>
      )}
      {startError && (
        <p role="alert" className="text-sm font-semibold text-(--accent-ink)">
          Não conseguimos começar uma nova conversa, tente de novo.
        </p>
      )}
    </Modal>
  );
}
