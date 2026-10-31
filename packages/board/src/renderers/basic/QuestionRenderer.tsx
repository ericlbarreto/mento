"use client";

import type { RendererProps } from "../types";

/** Verification question. The answer input comes in a later track (T6). */
export function QuestionRenderer({ element }: RendererProps<"question">) {
  const { question } = element.data;
  return (
    <div className="rounded-(--radius-lg) border-2 border-dashed border-(--mento-blue) bg-(--mento-blue-soft) px-5 py-4">
      <p className="text-xs font-bold tracking-wide text-(--mento-blue-strong) uppercase">Pergunta para você</p>
      <p className="mt-1 font-(family-name:--font-board) text-[28px] leading-snug text-(--ink)">{question}</p>
    </div>
  );
}
