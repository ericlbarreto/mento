import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx, focusRing, transition } from "./cx";

export type ChipVariant = "source" | "outside" | "quick" | "status";

const variants: Record<ChipVariant, string> = {
  source: "bg-(--mento-blue-soft) text-(--mento-blue-strong)",
  outside: "bg-(--accent-soft) text-(--accent-ink)",
  quick: "border border-(--line) bg-(--card) text-(--ink)",
  status: "bg-(--paper-2) text-(--ink-soft)",
};

const hovers: Record<ChipVariant, string> = {
  source: "hover:bg-(--marker-blue)",
  outside: "hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--card))]",
  quick: "hover:border-(--mento-blue) hover:text-(--mento-blue-strong)",
  status: "hover:bg-(--line)",
};

const defaultLabels: Partial<Record<ChipVariant, string>> = { outside: "Fora do material" };

function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-3.5">
      <path d="M4 1.75h5.25L12.5 5v8.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M9 1.75V5.25h3.5M5.5 8.5h5M5.5 11h3.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-3.5">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4M8 4.9v.1" strokeLinecap="round" />
    </svg>
  );
}

const defaultIcons: Partial<Record<ChipVariant, ReactNode>> = { source: <DocIcon />, outside: <InfoIcon /> };

export type ChipProps = ComponentPropsWithRef<"button"> & {
  variant?: ChipVariant;
  /** Leading icon; defaults to a doc icon for `source` and an info icon for `outside`. Pass null to hide. */
  icon?: ReactNode;
  /** Status dot color (CSS color or var), for `status` chips. */
  dot?: string;
};

/**
 * Pill chip. Renders a <button> when it has an onClick (e.g., a source chip opening the PDF drawer at the page)
 * and a plain <span> otherwise. Default label for `outside`: "Fora do material".
 */
export function Chip({ variant = "status", icon, dot, onClick, type = "button", className, children, ...rest }: ChipProps) {
  const leading = icon === undefined ? defaultIcons[variant] : icon;
  const classes = cx(
    "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-(--radius-pill) px-3 text-[13px] font-bold leading-none",
    variants[variant],
    className,
  );
  const content = (
    <>
      {dot && <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
      {leading}
      <span className="truncate">{children ?? defaultLabels[variant]}</span>
    </>
  );

  if (!onClick) {
    const { title, id, style, "aria-label": ariaLabel } = rest;
    return (
      <span className={classes} title={title} id={id} style={style} aria-label={ariaLabel}>
        {content}
      </span>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      className={cx(classes, "cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50", hovers[variant], transition, focusRing)}
      {...rest}
    >
      {content}
    </button>
  );
}
