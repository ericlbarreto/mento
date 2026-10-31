"use client";

import { useId, useState, type FormEvent } from "react";
import { useBoardEnv } from "../../board/context";
import type { RendererProps } from "../types";

const MAX_ANSWER_CHARS = 2000;

/**
 * Verification question. While it is the open question (BoardEnv.verification), an answer box sits under it and
 * sends `verification_answer`; once answered, the answer stays under the question.
 */
export function QuestionRenderer({ element }: RendererProps<"question">) {
  const { question, verification_id } = element.data;
  const { verification } = useBoardEnv();
  const open = verification?.openElementId === element.id;
  const answered = verification?.answered.get(element.id);
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const answer = draft.trim();
    if (!answer || !verification) return;
    verification.onAnswer({ element_id: element.id, verification_id, answer });
    setDraft("");
  };

  return (
    <div className="rounded-(--radius-lg) border-2 border-dashed border-(--mento-blue) bg-(--mento-blue-soft) px-5 py-4">
      <p className="text-xs font-bold tracking-wide text-(--mento-blue-strong) uppercase">Pergunta para você</p>
      <p data-board-write="" className="mt-1 font-(family-name:--font-board) text-[28px] leading-snug text-(--ink)">
        {question}
      </p>
      {open && (
        // data-board-control: clicks here are not click-and-ask selections.
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2" data-board-control="">
          <label htmlFor={inputId} className="sr-only">
            Sua resposta
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_ANSWER_CHARS}
            placeholder="Escreva sua resposta…"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-(--radius-pill) border border-(--line) bg-(--card) px-4 text-[15px] text-(--ink) outline-none focus-visible:shadow-(--focus-ring)"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="h-10 rounded-(--radius-pill) bg-(--mento-blue) px-4 text-[15px] font-bold text-white outline-none hover:bg-(--mento-blue-strong) focus-visible:shadow-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-50"
          >
            Responder
          </button>
        </form>
      )}
      {answered && (
        <p className="mt-2 text-[15px] text-(--ink)">
          <span className="font-bold text-(--mento-blue-strong)">Sua resposta: </span>
          {answered}
        </p>
      )}
    </div>
  );
}
