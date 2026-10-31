"use client";

// Owner: Person 2. What a voice session shows around the orb: the "Toque para ativar" start button (no gesture
// yet: reload or direct link), the mic state indicator in the bottom controls, the student's live (interim)
// caption, and the notice when the mic is blocked or voice is unavailable (the lesson goes on by text).
import { Button, IconMic, cx } from "@mento/ui";
import { MIC_LABEL, type MicStatus } from "./turnTaking";

export function VoiceStartGate({ onStart, onTextOnly, busy }: { onStart: () => void; onTextOnly: () => void; busy: boolean }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-(--paper)/80 px-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-gate-title" className="flex max-w-md flex-col items-center gap-4 rounded-(--radius-xl) bg-(--card) px-8 py-8 text-center shadow-(--shadow-float)">
        <img src="/brand/mascot.png" alt="" className="w-20" />
        <h2 id="voice-gate-title" className="text-[22px] leading-tight font-extrabold text-(--ink)">
          O Mento vai falar com você
        </h2>
        <p className="text-base text-(--ink-soft)">Ative o som para ouvir o tutor e o microfone para responder falando.</p>
        <Button size="lg" onClick={onStart} loading={busy} autoFocus>
          <IconMic className="size-5" aria-hidden="true" />
          Toque para ativar o som e o microfone
        </Button>
        <button
          type="button"
          onClick={onTextOnly}
          className="rounded-(--radius-pill) px-3 py-1 text-[15px] font-bold text-(--mento-blue-strong) outline-none hover:underline focus-visible:shadow-(--focus-ring)"
        >
          Continuar só com texto
        </button>
      </div>
    </div>
  );
}

const DOT: Record<MicStatus, string> = {
  off: "bg-(--ink-soft)",
  asking: "bg-(--mento-blue) animate-pulse",
  connecting: "bg-(--mento-blue) animate-pulse",
  listening: "bg-[#16a34a] animate-pulse",
  muted: "bg-(--ink-soft)",
  denied: "bg-[#dc2626]",
  unavailable: "bg-[#dc2626]",
  error: "bg-[#dc2626]",
};

/** Bottom-controls pill: the mic state; a click mutes / unmutes (same as the orb). */
export function MicIndicator({ status, onToggle }: { status: MicStatus; onToggle: () => void }) {
  const off = status !== "listening";
  const action =
    status === "listening" ? "Silenciar o microfone" : status === "denied" || status === "unavailable" ? MIC_LABEL[status] : "Ligar o microfone";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${MIC_LABEL[status]}. ${action}`}
      aria-pressed={status === "listening"}
      className="pointer-events-auto flex h-11 items-center gap-2 rounded-(--radius-pill) bg-(--card) px-3.5 text-[14px] font-bold text-(--ink) shadow-(--shadow-float) outline-none focus-visible:shadow-(--focus-ring)"
    >
      <span className="relative inline-flex">
        <IconMic className="size-5" aria-hidden="true" />
        {off && <span aria-hidden="true" className="absolute top-1/2 left-1/2 h-0.5 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />}
      </span>
      <span aria-hidden="true" className={cx("size-2 rounded-full", DOT[status])} />
      <span aria-live="polite">{MIC_LABEL[status]}</span>
    </button>
  );
}

/** The student's words as Deepgram hears them, above the orb, until the final caption is sent. */
export function InterimCaption({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none w-full max-w-2xl rounded-(--radius-xl) border border-(--line) bg-(--paper-2) px-5 py-2.5 text-center text-[17px] text-(--ink) italic shadow-(--shadow-float)">
      <span className="mr-2 text-[13px] font-bold not-italic text-(--ink-soft) uppercase">Você</span>
      {text}
    </div>
  );
}

/** Mic blocked or voice down: say why and keep the lesson going by text. */
export function VoiceNotice({ status, onText }: { status: MicStatus; onText: () => void }) {
  const message =
    status === "denied"
      ? "Permita o microfone nas configurações do navegador para conversar por voz."
      : status === "unavailable"
        ? "A conversa por voz não está disponível agora. Você pode continuar por texto."
        : status === "error"
          ? "Não conseguimos ligar o microfone. Toque no microfone para tentar de novo, ou continue por texto."
          : null;
  if (!message) return null;
  return (
    <div role="status" className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-3 rounded-(--radius-xl) bg-(--card) px-5 py-3 text-center text-[15px] text-(--ink) shadow-(--shadow-float)">
      <span>{message}</span>
      <Button size="sm" variant="secondary" onClick={onText}>
        Continuar por texto
      </Button>
    </div>
  );
}
