import type { ComponentPropsWithRef } from "react";
import { cx, focusRing, transition } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-(--mento-blue) text-white shadow-(--shadow-card) hover:bg-(--mento-blue-strong) disabled:hover:bg-(--mento-blue)",
  secondary:
    "border border-(--line) bg-(--card) text-(--ink) hover:border-(--mento-blue) hover:text-(--mento-blue-strong) disabled:hover:border-(--line) disabled:hover:text-(--ink)",
  ghost: "bg-transparent text-(--ink) hover:bg-(--paper-2) disabled:hover:bg-transparent",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-[15px]",
  lg: "h-12 gap-2 px-6 text-base",
};

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks clicks while keeping the label. */
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-(--radius-pill) font-bold",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        disabled && !loading && "opacity-50",
        loading && "cursor-progress",
        transition,
        focusRing,
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}
