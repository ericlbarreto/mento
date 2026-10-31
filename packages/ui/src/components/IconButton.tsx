import type { ComponentPropsWithRef } from "react";
import { buttonVariants, type ButtonVariant } from "./Button";
import { cx, focusRing, transition } from "./cx";
import { INERT_LABEL, inertClasses, inertProps } from "./inert";
import { Spinner } from "./Spinner";

export type IconButtonSize = "sm" | "md" | "lg";

const sizes: Record<IconButtonSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-10 [&_svg]:size-5",
  lg: "size-14 [&_svg]:size-6",
};

export type IconButtonProps = Omit<ComponentPropsWithRef<"button">, "aria-label"> & {
  /** Required: the button has no visible text (e.g., "Pausar", "Abrir microfone"). */
  "aria-label": string;
  variant?: ButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  /** Drawn but not wired yet: focusable, aria-disabled="true", "Em breve" tooltip, click does nothing. */
  inert?: boolean;
};

/** Round icon-only button, used for the orb controls (pause, mic, keyboard). */
export function IconButton({
  variant = "secondary",
  size = "md",
  loading = false,
  inert = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: IconButtonProps) {
  if (inert) {
    const { onClick: _onClick, "aria-label": label, ...safe } = rest;
    return (
      <button
        type={type}
        aria-label={`${label} (${INERT_LABEL})`}
        className={cx(
          "inline-flex shrink-0 select-none items-center justify-center rounded-full",
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
      </button>
    );
  }
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        "active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100",
        disabled && !loading && "opacity-50",
        transition,
        focusRing,
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "lg" ? 20 : 16} /> : children}
    </button>
  );
}
