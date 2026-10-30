import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "info" | "warning";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-(--paper-2) text-(--ink-soft) border-(--line)",
  info: "bg-(--mento-blue-soft) text-(--mento-blue-strong) border-transparent",
  warning: "bg-(--accent-soft) text-(--accent-ink) border-transparent",
};

export type BadgeProps = ComponentPropsWithRef<"span"> & { tone?: BadgeTone };

/** Small static label (not interactive). */
export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-(--radius-sm) border px-2 text-xs font-bold",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** Required wherever invented data is shown (AGENTS.md rule 4). */
export function SimulatedDataBadge({ children = "Dados simulados", ...rest }: Omit<BadgeProps, "tone">) {
  return (
    <Badge tone="warning" title="Estes dados são simulados e não são evidência real" {...rest}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-3.5">
        <path d="M6 1.75h4M6.75 1.75v4L3 12.6a1.1 1.1 0 0 0 1 1.65h8a1.1 1.1 0 0 0 1-1.65L9.25 5.75v-4" strokeLinejoin="round" />
        <path d="M4.75 10h6.5" strokeLinecap="round" />
      </svg>
      {children}
    </Badge>
  );
}
