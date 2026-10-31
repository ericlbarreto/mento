"use client";

// Owner: Person 2. Session header (Stitch S3/S4): back to the start (without ending the lesson), the
// "{Matéria} · {título}" breadcrumb, the lesson history button, "Material Didático" (inert until Person 1's
// files route) and the options menu (inert until track N2). With the chat closed (S4) it shows the
// "Conversa em tempo real" pill that reopens it.
import Link from "next/link";
import {
  Button,
  IconArrowLeft,
  IconBookOpen,
  IconButton,
  IconChevronLeft,
  IconHistory,
  IconMessage,
  IconMoreVertical,
  cx,
} from "@mento/ui";

export function SessionHeader({
  subjectName,
  title,
  historyCount,
  onOpenHistory,
  chatOpen,
  onOpenChat,
}: {
  subjectName: string;
  title: string;
  /** Sessions of this student in this subject (null while loading or unknown). */
  historyCount: number | null;
  /** Opens the history drawer (track O). Absent: the button is shown but does nothing yet. */
  onOpenHistory?: () => void;
  chatOpen: boolean;
  onOpenChat: () => void;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2">
      <Link
        href="/"
        aria-label="Voltar ao início"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-(--card) text-(--ink) shadow-(--shadow-card) outline-none hover:text-(--mento-blue-strong) focus-visible:shadow-(--focus-ring)"
      >
        <IconArrowLeft className="size-5" aria-hidden="true" />
      </Link>
      <p className="flex min-w-0 items-baseline gap-2 text-lg">
        <span className="font-extrabold text-(--ink)">{subjectName}</span>
        <span aria-hidden="true" className="text-(--ink-soft)">
          ·
        </span>
        <span className="truncate text-(--ink-soft)">{title}</span>
      </p>
      <button
        type="button"
        onClick={onOpenHistory}
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-2 rounded-(--radius-pill) bg-(--mento-blue-soft) px-3.5 text-[15px] font-bold text-(--ink) outline-none hover:bg-(--marker-blue) focus-visible:shadow-(--focus-ring)"
      >
        <IconHistory className="size-4 text-(--mento-blue-strong)" aria-hidden="true" />
        Histórico de Aulas
        {historyCount !== null && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-(--mento-blue) px-1.5 text-xs leading-5 text-white">
            {historyCount}
          </span>
        )}
      </button>

      <div className="ml-auto flex items-center gap-3">
        <Button inert variant="secondary" size="sm" className="rounded-(--radius-pill)">
          <IconBookOpen className="size-4" aria-hidden="true" />
          Material Didático
        </Button>
        {!chatOpen && (
          <button
            type="button"
            onClick={onOpenChat}
            className={cx(
              "inline-flex h-10 items-center gap-2 rounded-(--radius-pill) border border-(--line) bg-(--card) px-4 text-[15px] font-bold text-(--ink)",
              "outline-none hover:border-(--mento-blue) focus-visible:shadow-(--focus-ring)",
            )}
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-(--accent)" />
            <IconMessage className="size-4 text-(--mento-blue-strong)" aria-hidden="true" />
            Conversa em tempo real
            <IconChevronLeft className="size-4 text-(--ink-soft)" aria-hidden="true" />
          </button>
        )}
        <IconButton inert aria-label="Mais opções" variant="ghost">
          <IconMoreVertical />
        </IconButton>
      </div>
    </div>
  );
}
