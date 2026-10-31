import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./cx";
import { IconCheckCircle, IconCircle, IconClock } from "./icons";
import { Spinner } from "./Spinner";
import { VisuallyHidden } from "./VisuallyHidden";

export type LoadingStageState = "pending" | "active" | "done";
export type LoadingStage = { id: string; label: string; state: LoadingStageState };

const stateLabels: Record<LoadingStageState, string> = {
  pending: "pendente",
  active: "em andamento",
  done: "concluído",
};

export type LoadingOverlayProps = Omit<ComponentPropsWithRef<"div">, "title"> & {
  /** e.g. "Preparando sua aula…" */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Speech bubble next to the mascot, e.g. "Tô quase!" */
  bubble?: string;
  /** Handwritten quote, e.g. "Respira fundo, o aprendizado começa agora!" */
  quote?: string;
  /** Real progress steps only (plan §3 S2): no invented counts, no fake percentage. */
  stages?: LoadingStage[];
  /** Shown when loading takes too long, e.g. "Está demorando mais que o normal…". */
  slowNotice?: ReactNode;
  mascotSrc?: string;
  logoSrc?: string;
};

/**
 * "Preparando sua aula" screen (Stitch S2): mascot inside a dashed ring with an orbiting dot, a speech bubble,
 * a handwritten quote, title and subtitle, the stage list and an indeterminate bar. Fills its container; the
 * caller positions it (e.g. `absolute inset-0` over the board). Motion stops under prefers-reduced-motion.
 */
export function LoadingOverlay({
  title,
  subtitle,
  bubble,
  quote,
  stages = [],
  slowNotice,
  mascotSrc = "/brand/mascot.png",
  logoSrc = "/brand/logo.png",
  className,
  ...rest
}: LoadingOverlayProps) {
  const active = stages.find((stage) => stage.state === "active");
  return (
    <div
      aria-busy="true"
      className={cx(
        "relative flex w-full flex-col items-center justify-center gap-6 bg-(--paper) px-4 py-10 text-center text-(--ink)",
        className,
      )}
      {...rest}
    >
      {quote && (
        <p className="max-w-[22ch] -rotate-2 font-(family-name:--font-board) text-[26px] leading-tight text-(--accent-ink) sm:absolute sm:right-[8%] sm:top-10 sm:text-left">
          “{quote}”
        </p>
      )}

      <div className="relative size-60 shrink-0" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-(--mascot-light)" />
        <div className="absolute inset-0 motion-safe:animate-[mento-orbit_6s_linear_infinite]">
          <span className="absolute left-1/2 top-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--mento-blue) shadow-[0_0_0_4px_var(--paper)]" />
        </div>
        <div className="absolute inset-6 flex items-center justify-center rounded-full bg-[radial-gradient(circle,var(--card)_55%,var(--mento-blue-soft))] shadow-(--shadow-card)">
          <img src={mascotSrc} alt="" className="w-28" />
        </div>
        {bubble && (
          <span className="absolute -right-4 top-8 rotate-6 rounded-(--radius-lg) rounded-bl-[4px] border border-(--line) bg-(--card) px-3.5 py-1.5 text-base font-extrabold text-(--ink) shadow-(--shadow-float)">
            {bubble}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <img src={logoSrc} alt="Mento" className="h-7 w-auto" />
        <h2 className="text-[26px] font-extrabold leading-tight text-balance sm:text-[32px]">{title}</h2>
        {subtitle && <p className="max-w-[46ch] text-base leading-relaxed text-(--ink-soft) text-pretty">{subtitle}</p>}
      </div>

      <div
        role="progressbar"
        aria-label="Carregando"
        className="relative h-2 w-full max-w-md overflow-hidden rounded-(--radius-pill) bg-(--mento-blue-soft)"
      >
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-(--radius-pill) bg-(--mento-blue) motion-safe:animate-[mento-indeterminate_1.4s_var(--ease-out)_infinite] motion-reduce:w-full motion-reduce:opacity-40" />
      </div>

      {stages.length > 0 && (
        <ol className="flex w-full max-w-md flex-col gap-2 text-left">
          {stages.map((stage) => (
            <li
              key={stage.id}
              className={cx(
                "flex items-center gap-3 rounded-(--radius-md) border px-4 py-3 text-[15px]",
                stage.state === "active"
                  ? "border-(--mento-blue) bg-(--card) font-bold text-(--ink) shadow-(--shadow-card)"
                  : "border-(--line) bg-(--card)",
                stage.state === "pending" && "text-(--ink-soft)",
                stage.state === "done" && "font-semibold text-(--ink)",
              )}
            >
              <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center text-(--mento-blue)">
                {stage.state === "done" && <IconCheckCircle className="size-5" />}
                {stage.state === "active" && <Spinner size={18} />}
                {stage.state === "pending" && <IconCircle className="size-5 text-(--line)" />}
              </span>
              <span className="flex-1">{stage.label}</span>
              <VisuallyHidden>({stateLabels[stage.state]})</VisuallyHidden>
            </li>
          ))}
        </ol>
      )}

      {/* One short live region: the active stage and the slow notice, not the whole screen. */}
      <p role="status" className="sr-only">
        {active?.label}
        {slowNotice && <> · {slowNotice}</>}
      </p>

      {slowNotice && (
        <p aria-hidden="true" className="inline-flex items-center gap-2 rounded-(--radius-pill) bg-(--accent-soft) px-4 py-2 text-sm font-bold text-(--accent-ink)">
          <IconClock className="size-4" />
          {slowNotice}
        </p>
      )}
    </div>
  );
}
