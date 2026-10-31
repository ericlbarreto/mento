"use client";
// Owner: Person 1. Small building blocks of the teacher UI, styled with the shared tokens (teacher.css).
import { useEffect, useId, useRef } from "react";
import { initials } from "../_lib/format";
import { IconX } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" };

export function buttonClass(variant: ButtonProps["variant"] = "primary") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold transition-colors",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-[var(--mento-blue)] text-white hover:bg-[var(--blue-strong)]",
    variant === "secondary" && "border-[1.5px] border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[var(--paper-2)]",
    variant === "ghost" && "bg-transparent text-[var(--ink)] hover:bg-[var(--blue-tint)]",
  );
}

export function Button({ variant, className, ...rest }: ButtonProps) {
  return <button type="button" className={cx(buttonClass(variant), className)} {...rest} />;
}

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-[18px] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-card)]", className)} {...rest} />;
}

type Tone = "neutral" | "blue" | "danger" | "warn" | "ok";
const TONES: Record<Tone, string> = {
  neutral: "bg-[var(--paper-2)] text-[var(--ink)]",
  blue: "bg-[var(--blue-tint)] text-[var(--mento-blue)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
  ok: "bg-[var(--ok-soft)] text-[var(--ok)]",
};

export function Chip({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function SimulatedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--accent)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--accent-ink)]">
      Dados simulados
    </span>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--blue-tint)] font-bold text-[var(--mento-blue)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-1 font-[family-name:var(--font-board)] text-xl text-[var(--accent-ink)]">{eyebrow}</p>}
        <h1 className="text-[32px] font-extrabold leading-10 tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-2 text-[17px] leading-7 text-[var(--ink-soft)]">{description}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </header>
  );
}

/** Native <dialog> modal: Esc and the backdrop close it; focus returns to the opener. */
export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[20px] border border-[var(--line)] bg-[var(--card)] p-0 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop:bg-[rgba(22,34,80,0.35)]"
    >
      <div className="p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-2xl font-bold">
              {title}
            </h2>
            {description && <p className="mt-1 text-[15px] text-[var(--ink-soft)]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className={cx(buttonClass("ghost"), "size-10 p-0")} aria-label="Fechar">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export const inputClass =
  "w-full rounded-xl border-[1.5px] border-[var(--line)] bg-[var(--card)] px-4 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink)]/40 focus:border-[var(--mento-blue)] focus:outline-none focus:ring-4 focus:ring-[var(--blue-tint)]";
