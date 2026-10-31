"use client";
// Owner: Person 1. The student's conversations with the tutor, one row each, newest first, paginated.
// A row says what the conversation was about (the concepts the tutor checked, or the lesson) and what came out of it;
// never what the student wrote (D70).
import { useState } from "react";
import { relativeDate } from "../_lib/format";
import { conversationResult, conversationTitle, durationLabel, questionsLine } from "../_lib/status";
import type { SessionItem } from "../_lib/types";
import { IconChevronRight, IconMessage } from "./icons";
import { Card, Chip, SectionTitle, cx } from "./ui";

export const PAGE_SIZE = 8;

export function ConversationsTable({ sessions }: { sessions: SessionItem[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = sessions.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const from = current * PAGE_SIZE + 1;
  const to = current * PAGE_SIZE + shown.length;

  return (
    <Card className="overflow-hidden">
      <div className="px-6 pt-6">
        <SectionTitle
          icon={<IconMessage size={18} />}
          title="Conversas com o tutor"
          badge={
            <Chip className="text-[12px]">
              {sessions.length} {sessions.length === 1 ? "conversa" : "conversas"}
            </Chip>
          }
        />
      </div>
      <table className="w-full text-left">
        <thead className="bg-[var(--paper-2)] text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--ink-soft)] max-md:hidden">
          <tr>
            <th scope="col" className="px-6 py-3">Quando</th>
            <th scope="col" className="px-4 py-3">Assunto</th>
            <th scope="col" className="px-4 py-3">Duração</th>
            <th scope="col" className="px-4 py-3">Perguntas</th>
            <th scope="col" className="px-6 py-3">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => {
            const { title, detail } = conversationTitle(s);
            const result = conversationResult(s);
            return (
              <tr key={s.id} className="border-t border-[var(--line)] max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-4">
                <td className="whitespace-nowrap px-6 py-4 text-[14px] font-semibold text-[var(--ink-soft)] max-md:w-full max-md:p-0">{relativeDate(s.started_at)}</td>
                <td className="px-4 py-4 max-md:w-full max-md:p-0">
                  <p className="text-[16px] font-bold leading-6">{title}</p>
                  {detail && <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">{detail}</p>}
                </td>
                {/* On a phone an empty value ("—") is left out instead of shown without its column header. */}
                <td className={cx("whitespace-nowrap px-4 py-4 text-[14px] max-md:p-0 max-md:text-[var(--ink-soft)]", !s.ended_at && "max-md:hidden")}>{durationLabel(s)}</td>
                <td className={cx("whitespace-nowrap px-4 py-4 text-[14px] max-md:p-0 max-md:text-[var(--ink-soft)]", !s.questions && "max-md:hidden")}>
                  {questionsLine(s)}
                </td>
                <td className="px-6 py-4 max-md:ml-auto max-md:p-0">
                  <Chip tone={result.tone} className="text-[12px]">
                    {result.label}
                  </Chip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pages > 1 && (
        <nav aria-label="Páginas de conversas" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-6 py-4">
          <p className="text-[14px] text-[var(--ink-soft)]">
            {from}–{to} de {sessions.length}
          </p>
          <div className="flex items-center gap-1">
            <PageButton label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <IconChevronRight size={16} className="rotate-180" />
            </PageButton>
            {Array.from({ length: pages }, (_, i) => (
              <PageButton key={i} label={`Página ${i + 1}`} current={i === current} onClick={() => setPage(i)}>
                {i + 1}
              </PageButton>
            ))}
            <PageButton label="Próxima página" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
              <IconChevronRight size={16} />
            </PageButton>
          </div>
        </nav>
      )}
    </Card>
  );
}

function PageButton({ label, current, disabled, onClick, children }: { label: string; current?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex size-9 items-center justify-center rounded-full text-[14px] font-bold transition-colors disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]",
        current ? "bg-[var(--mento-blue)] text-white" : "text-[var(--ink)] hover:bg-[var(--blue-tint)]",
      )}
    >
      {children}
    </button>
  );
}
