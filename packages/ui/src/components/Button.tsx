import type { ComponentPropsWithRef } from "react";
import { cx, focusRing, transition } from "./cx";
import { INERT_LABEL, inertClasses, inertProps } from "./inert";
import { Spinner } from "./Spinner";
import { VisuallyHidden } from "./VisuallyHidden";

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
  /**
   * Drawn but not wired yet (plan §6): stays focusable, aria-disabled="true", "Em breve" tooltip, click does nothing.
   * Shadows the HTML `inert` attribute on purpose; it is never forwarded to the DOM.
   */
  inert?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  inert = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  if (inert) {
    const { onClick: _onClick, ...safe } = rest;
    return (
      <button
        type={type}
        className={cx(
          "inline-flex select-none items-center justify-center whitespace-nowrap rounded-(--radius-pill) font-bold",
          transition,
          focusRing,
          buttonVariants[variant],
          sizes[size],
          inertClasses,
          className,
        )}
        {...safe}
        {...inertProps()}
      >
        {children}
        <VisuallyHidden>({INERT_LABEL})</VisuallyHidden>
      </button>
    );
  }
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

/** A Button that is always inert (shortcut for `<Button inert>`). */
export function InertButton(props: Omit<ButtonProps, "inert">) {
  return <Button {...props} inert />;
}
