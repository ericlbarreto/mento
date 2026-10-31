"use client";

// Owner: Person 2. "Conversa em tempo real" (Stitch S3, right column): the transcript (student lines by text or
// voice, tutor lines with their sources), what the tutor is doing now, the click-and-ask chip and the input.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { Button, Chip, IconChevronRight, IconMic, IconPencil, IconX } from "@mento/ui";
import type { ChatLine } from "../useSessionController";
import { type BoardSelection, type SessionErrorView, MAX_MESSAGE_CHARS, clockTime, sourceLabel } from "../sessionModel";

export function ChatPanel({
  lines,
  speakingId,
  annotating,
  thinking,
  selection,
  onClearSelection,
  onSend,
  error,
  onRetry,
  onCollapse,
  inputRef,
}: {
  lines: ChatLine[];
  /** Action id of the speak playing now ("Falando agora…" under its line). */
  speakingId: string | null;
  /** Non-speak actions are playing ("Tutor anotando na lousa…"). */
  annotating: boolean;
  /** Turn sent, nothing played yet. */
  thinking: boolean;
  selection: BoardSelection | null;
  onClearSelection: () => void;
  /** Returns false when nothing was sent (empty text). */
  onSend: (text: string) => boolean;
  error: SessionErrorView | null;
  onRetry: () => void;
  onCollapse: () => void;
  inputRef: Ref<HTMLTextAreaElement>;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the newest line in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines.length, annotating, thinking]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (onSend(draft)) setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit();
    if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
  };

  return (
    <aside aria-label="Conversa em tempo real" className="flex h-full min-h-0 flex-col border-l border-(--line) bg-(--paper-2)">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-(--line) px-5">
        <h2 className="flex items-center gap-2.5 text-lg font-extrabold text-(--ink)">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-(--accent)" />
          Conversa em tempo real
        </h2>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Fechar conversa e ampliar a lousa"
          className="inline-flex size-9 items-center justify-center rounded-full text-(--ink-soft) outline-none hover:bg-(--card) hover:text-(--ink) focus-visible:shadow-(--focus-ring)"
        >
          <IconChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <ol ref={listRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5" aria-live="polite" aria-relevant="additions">
        {lines.length === 0 && !thinking && (
          <li className="text-center text-sm text-(--ink-soft)">A conversa com o tutor aparece aqui.</li>
        )}
        {lines.map((line) =>
          line.role === "student" ? (
            <li key={line.id} className="flex flex-col items-end gap-1">
              <p className="max-w-[85%] rounded-(--radius-md) bg-(--mento-blue-soft) px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-(--ink)">
                {line.text}
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-(--ink-soft)">
                {line.via === "voice" && <IconMic className="size-3.5" aria-hidden="true" />}
                {line.via === "voice" ? "Por voz" : "Texto"}
                {clockTime(line.at) && <> · {clockTime(line.at)}</>}
              </span>
            </li>
          ) : (
            <li key={line.id} className="flex gap-3">
              <img src="/brand/mascot.png" alt="" className="mt-1 size-8 shrink-0 rounded-full bg-(--mento-blue-soft) object-contain p-1" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="sr-only">Tutor:</span>
                <p className="rounded-(--radius-md) bg-(--card) px-4 py-2.5 text-[15px] leading-relaxed text-(--ink) shadow-(--shadow-card)">
                  {line.text}
                </p>
                {((line.sources?.length ?? 0) > 0 || line.outside_material) && (
                  <div className="flex flex-wrap gap-1.5">
                    {line.sources?.map((s, i) => (
                      <Chip key={`${s.page}-${i}`} variant="source" title={`“${s.quote}”`}>
                        {sourceLabel(s)}
                      </Chip>
                    ))}
                    {line.outside_material && <Chip variant="outside">Fora do material didático</Chip>}
                  </div>
                )}
                <span className="text-xs font-bold text-(--ink-soft)">
                  {line.action_id && line.action_id === speakingId ? "Falando agora…" : clockTime(line.at)}
                </span>
              </div>
            </li>
          ),
        )}
        {thinking && <li className="text-sm font-bold text-(--ink-soft)">Mento está pensando…</li>}
        {annotating && (
          <li className="flex items-center gap-2 rounded-(--radius-md) bg-(--mento-blue-soft) px-4 py-3 text-sm font-bold text-(--ink)">
            <IconPencil className="size-4 text-(--mento-blue-strong)" aria-hidden="true" />
            Tutor anotando na lousa…
          </li>
        )}
      </ol>

      <div className="shrink-0 border-t border-(--line) px-5 pt-4 pb-3">
        {error && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-(--radius-md) bg-(--danger-soft) px-3 py-2 text-sm text-(--ink)">
            <span className="flex-1 font-bold">
              {error.title}
              {error.message && <span className="font-normal"> · {error.message}</span>}
            </span>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Tentar de novo
            </Button>
          </div>
        )}
        {selection && (
          <div className="mb-2 flex">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-(--radius-pill) bg-(--marker-yellow) py-1 pr-1 pl-3 text-[13px] font-bold text-(--ink)">
              <span className="truncate">Sobre: “{selection.label}”</span>
              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Remover o trecho selecionado"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full outline-none hover:bg-(--card) focus-visible:shadow-(--focus-ring)"
              >
                <IconX className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
        )}
        <form onSubmit={submit} className="flex items-end gap-2 rounded-(--radius-xl) border border-(--line) bg-(--card) py-1.5 pr-1.5 pl-4 focus-within:shadow-(--focus-ring)">
          <label htmlFor="session-chat-input" className="sr-only">
            Mensagem para o tutor
          </label>
          <textarea
            id="session-chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_CHARS}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={selection ? "Pergunte sobre o trecho…" : "Escreva uma mensagem…"}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-(--ink) outline-none placeholder:text-(--ink-soft)"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Enviar"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--mento-blue) text-white outline-none hover:bg-(--mento-blue-strong) focus-visible:shadow-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-(--ink-soft)">Clique na lousa para perguntar sobre um trecho ou digite sua dúvida</p>
      </div>
    </aside>
  );
}
