"use client";

// Owner: Person 2. "Histórico de Aulas" (Stitch S7, plan §3): the student's sessions (in this subject, or all for
// a free board), with search, status filters and reopen. Mounted by the session page and the student home.
// Only API fields are shown: no summaries, "anotações" counts or audio minutes (plan §6).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionSummary } from "@mento/contracts";
import { Button, Chip, Drawer, IconArrowRight, IconClock, IconEye, IconMessage, IconPlus, IconSearch, IconVolume, cx } from "@mento/ui";
import { createSession, listSessions } from "@/lib/api";
import {
  FILTERS,
  countByFilter,
  drawerTitle,
  historyDate,
  historyDuration,
  historyTitle,
  interactions,
  isEnded,
  newConversationLabel,
  visibleSessions,
  type HistoryFilter,
} from "./historyModel";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; list: SessionSummary[] };

export type HistoryDrawerProps = {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
  /** The subject to list (and start a new conversation in); null for the free board (every session). */
  subject: { id: string; name: string } | null;
  /** The session on screen: pinned first as "Aula atual"; "Continuar" just closes the drawer. */
  currentSessionId?: string;
  /** Modality of the new conversation (the current session's, else voice). */
  modality?: "text" | "voice";
};

export function HistoryDrawer({ open, onClose, studentId, subject, currentSessionId, modality = "voice" }: HistoryDrawerProps) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const subjectId = subject?.id;

  const fetchList = useCallback(() => {
    if (!studentId) return () => {};
    let live = true;
    setLoad({ status: "loading" });
    listSessions({ student_id: studentId, subject_id: subjectId, limit: 100 })
      .then((list) => live && setLoad({ status: "ready", list }))
      .catch(() => live && setLoad({ status: "error" }));
    return () => {
      live = false;
    };
  }, [studentId, subjectId]);

  // Fresh list on every open (the current session's turn count and status change while it runs).
  useEffect(() => (open ? fetchList() : undefined), [open, fetchList]);

  const list = load.status === "ready" ? load.list : [];
  const counts = useMemo(() => countByFilter(list), [list]);
  const shown = useMemo(() => visibleSessions(list, { filter, query, currentId: currentSessionId }), [list, filter, query, currentSessionId]);

  const openSession = (id: string) => {
    onClose();
    if (id !== currentSessionId) router.push(`/session/${id}`);
  };

  const startNew = async () => {
    if (!studentId || starting) return;
    setStarting(true);
    setStartError(false);
    try {
      const { id } = await createSession({ student_id: studentId, modality, subject_id: subjectId ?? null });
      onClose();
      router.push(`/session/${id}`);
    } catch {
      setStartError(true);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      initialFocusRef={searchRef}
      eyebrow="Histórico de estudos"
      title={drawerTitle(subject?.name)}
      description="Sessões anteriores, anotações de lousa e status de conclusão."
      toolbar={
        <div className="flex flex-col gap-4">
          <label className="relative block">
            <span className="sr-only">Buscar aulas</span>
            <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-(--ink-soft)" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tópicos ou datas…"
              className="h-12 w-full rounded-(--radius-pill) border-[1.5px] border-(--line) bg-(--paper-2) pl-11 pr-4 text-[15px] text-(--ink) outline-none placeholder:text-(--ink-soft) focus-visible:border-(--mento-blue) focus-visible:shadow-[0_0_0_3px_var(--mento-blue-soft)]"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar aulas">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cx(
                  "h-9 rounded-(--radius-pill) px-4 text-[15px] font-semibold outline-none transition-colors duration-(--dur-fast) focus-visible:shadow-(--focus-ring)",
                  filter === f.id ? "bg-(--mento-blue) text-white" : "bg-(--paper-2) text-(--ink) hover:bg-(--mento-blue-soft)",
                )}
              >
                {f.label}
                {load.status === "ready" && ` (${counts[f.id]})`}
              </button>
            ))}
          </div>
        </div>
      }
      footer={
        <div className="flex w-full flex-col items-end gap-2">
          {startError && (
            <p role="alert" className="text-sm font-semibold text-(--accent-ink)">
              Não foi possível começar a conversa. Tente de novo.
            </p>
          )}
          <Button
            size="lg"
            loading={starting}
            disabled={!studentId}
            onClick={startNew}
            className="bg-(--mento-navy) hover:bg-(--mento-blue-strong) disabled:hover:bg-(--mento-navy)"
          >
            <IconPlus className="size-4" aria-hidden="true" />
            {newConversationLabel(subject?.name)}
          </Button>
        </div>
      }
    >
      {load.status === "loading" ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando aulas">
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="h-36 animate-pulse rounded-(--radius-xl) border border-(--line) bg-(--card) motion-reduce:animate-none" />
          ))}
        </div>
      ) : load.status === "error" ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-(--radius-lg) bg-(--accent-soft) px-5 py-4 text-(--accent-ink)">
          <p className="font-bold">Não conseguimos carregar o histórico</p>
          <Button variant="secondary" size="sm" onClick={fetchList}>
            Tentar de novo
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-base font-semibold text-(--ink-soft)">Nenhuma aula anterior ainda</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-base font-semibold text-(--ink-soft)">Nenhuma aula encontrada</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((s) => (
            <li key={s.id}>
              <HistoryCard session={s} current={s.id === currentSessionId} onOpen={() => openSession(s.id)} />
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function HistoryCard({ session, current, onOpen }: { session: SessionSummary; current: boolean; onOpen: () => void }) {
  const ended = isEnded(session);
  const date = historyDate(session.started_at);
  return (
    <article
      className={cx(
        "relative flex flex-col gap-3 overflow-hidden rounded-(--radius-xl) bg-(--card) p-5 shadow-(--shadow-card)",
        current ? "border-2 border-(--mento-blue) pt-6" : "border border-(--line)",
      )}
    >
      {current && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-(--mento-blue)" />}
      <div className="flex items-center justify-between gap-3">
        {current ? (
          <Chip variant="source" icon={null} dot="var(--mento-blue)">
            Aula atual · Agora
          </Chip>
        ) : (
          <Chip variant="status" icon={null} dot={ended ? "var(--success)" : "var(--mento-blue)"}>
            {ended ? "Concluída" : "Em andamento"}
          </Chip>
        )}
        {current ? (
          <span className="text-[13px] font-bold text-(--mento-blue-strong)">Em andamento</span>
        ) : (
          <span className="text-[13px] font-semibold text-(--ink-soft)">{date}</span>
        )}
      </div>
      <h3 className="text-lg font-bold leading-snug text-balance">{historyTitle(session)}</h3>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-(--ink-soft)">
        {current && <span>{date}</span>}
        <span className="inline-flex items-center gap-1.5">
          <IconClock className="size-3.5" aria-hidden="true" />
          {historyDuration(session)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IconMessage className="size-3.5" aria-hidden="true" />
          {interactions(session.turn_count)}
        </span>
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {!current && (
          <Button size="sm" variant="ghost" inert>
            <IconVolume className="size-4" aria-hidden="true" />
            Ouvir resumo em áudio
          </Button>
        )}
        {current || !ended ? (
          <Button size="sm" onClick={onOpen}>
            <IconArrowRight className="size-4" aria-hidden="true" />
            Continuar aula agora
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onOpen}>
            <IconEye className="size-4" aria-hidden="true" />
            Ver lousa da aula
          </Button>
        )}
      </div>
    </article>
  );
}
