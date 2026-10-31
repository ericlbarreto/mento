"use client";

// Owner: Person 2. S2 "Preparando sua aula…" over the session until the tutor's first action, and the error card
// when loading or the opening turn fails. Real stages only (plan §3 S2): no percentage, no claim cards.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, LoadingOverlay, type LoadingStage } from "@mento/ui";
import type { SessionErrorView } from "../sessionModel";

/** After this long the overlay says it is slower than usual. */
const SLOW_AFTER_MS = 8000;

export function SessionLoading({ stage }: { stage: "opening" | "preparing" }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const stages: LoadingStage[] = [
    { id: "board", label: "Abrindo a lousa", state: stage === "opening" ? "active" : "done" },
    {
      id: "tutor",
      label: "O tutor está preparando a aula",
      state: stage === "opening" ? "pending" : "active",
    },
  ];
  // LoadingOverlay is `relative`, so the covering layer is this wrapper.
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-(--paper)">
      <LoadingOverlay
        className="min-h-full"
        title="Preparando sua aula…"
        subtitle="Já já a lousa abre e o Mento começa a explicar."
        bubble="Tô quase!"
        quote="Respira fundo, o aprendizado começa agora!"
        stages={stages}
        slowNotice={slow ? "Está demorando mais que o normal…" : undefined}
      />
    </div>
  );
}

export function SessionErrorCard({
  error,
  onRetry,
}: {
  error: SessionErrorView;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-(--paper) px-4 py-10">
      <div role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
        <img src="/brand/mascot.png" alt="" className="w-24" />
        <h2 className="text-[26px] leading-tight font-extrabold text-(--ink)">{error.title}</h2>
        {error.message && <p className="text-base text-(--ink-soft)">{error.message}</p>}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onRetry}>Tentar de novo</Button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-(--radius-pill) border border-(--line) bg-(--card) px-4 text-[15px] font-bold text-(--ink) outline-none hover:border-(--mento-blue) focus-visible:shadow-(--focus-ring)"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
