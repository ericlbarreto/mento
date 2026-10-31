"use client";

// Owner: Person 2. The session options menu (Stitch S5, plan 2026-10-30-2330 §3 S5) and the paused / ended modal
// it opens (S6). "Encerrar conversa atual" ends the session (POST end, reason "manual") and stops the tutor;
// "Pausar aula" pauses the queue. The other three items are drawn but not wired (plan §6).
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionEndReason } from "@mento/contracts";
import { IconHelpCircle, IconPause, IconPower, IconRotateCcw, IconSliders, Menu, type MenuItem } from "@mento/ui";
import { createSession } from "@/lib/api";
import { SessionPauseModal, type PauseView } from "../pause/SessionPauseModal";
import { type SessionStats, sessionStats } from "../pause/sessionStats";
import type { SessionController } from "../useSessionController";

export function SessionOptions({
  controller: { session, player, lines },
  endNow,
  topic,
}: {
  controller: Pick<SessionController, "session" | "player" | "lines">;
  /** useEndSession's explicit end (once per mount; throws so it can be retried). */
  endNow: (reason: SessionEndReason) => Promise<void>;
  /** "{Matéria}: {título}" for the modal body. */
  topic: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<PauseView | null>(null);
  const [stats, setStats] = useState<SessionStats>({ elapsed: null, items: null, reference: null });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const startingRef = useRef(false);

  const open = (next: PauseView) => {
    setStats(sessionStats(session?.started_at, player.store.getState(), Date.now(), lines));
    setView(next);
  };

  const pause = () => {
    player.pause();
    open("paused");
  };

  const resume = () => {
    player.resume();
    setView(null);
  };

  const end = async () => {
    // Hold the tutor while the call runs; it is cut for good only once the end succeeded.
    player.pause();
    open("ending");
    try {
      await endNow("manual");
      player.interrupt();
      setView("ended");
    } catch {
      setView("end_failed");
    }
  };

  const newConversation = async () => {
    if (!session || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(false);
    try {
      const { id } = await createSession({ student_id: session.student_id, modality: session.modality, subject_id: session.subject?.id ?? null });
      router.push(`/session/${id}`);
    } catch {
      startingRef.current = false;
      setStarting(false);
      setStartError(true);
    }
  };

  const items: MenuItem[] = [
    {
      id: "end",
      label: "Encerrar conversa atual",
      description: "Salva anotações na lousa e conclui a sessão",
      icon: <IconPower />,
      tone: "danger",
      onSelect: () => void end(),
    },
    { id: "pause", label: "Pausar aula", icon: <IconPause />, onSelect: pause },
    { id: "clear", label: "Limpar anotações temporárias", icon: <IconRotateCcw />, inert: true, separatorBefore: true },
    { id: "audio", label: "Ajustes de áudio e microfone", icon: <IconSliders />, inert: true },
    { id: "report", label: "Relatar dúvida ou problema técnico", icon: <IconHelpCircle />, inert: true },
  ];

  return (
    <>
      <Menu items={items} label="Opções da sessão" heading="Opções da sessão" />
      <SessionPauseModal
        view={view}
        topic={topic}
        stats={stats}
        onResume={resume}
        onRetryEnd={() => void end()}
        onHome={() => router.push("/")}
        onNewConversation={session ? () => void newConversation() : undefined}
        starting={starting}
        startError={startError}
      />
    </>
  );
}
