"use client";
// Owner: Person 1. Loading and error blocks shared by the teacher screens.
import { Button, Card } from "./ui";

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 p-12 text-[16px] text-[var(--ink-soft)]" role="status" aria-live="polite">
      <span className="size-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--mento-blue)] motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </Card>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center" role="alert">
      <p className="text-xl font-bold">Não foi possível carregar os dados</p>
      <p className="max-w-md text-[15px] text-[var(--ink-soft)]">{message} Confira se a API está no ar e tente de novo.</p>
      <Button onClick={onRetry}>Tentar de novo</Button>
    </Card>
  );
}
