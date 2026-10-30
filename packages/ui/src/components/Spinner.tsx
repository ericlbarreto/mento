import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";

export type SpinnerProps = ComponentPropsWithRef<"span"> & {
  /** Diameter in px. */
  size?: number;
  /** Accessible label; omit when the parent already announces the busy state (e.g., a Button). */
  label?: string;
};

/** Small CSS ring spinner in currentColor. */
export function Spinner({ size = 16, label, className, style, ...rest }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx("inline-block shrink-0 rounded-full border-2 border-current border-r-transparent", className)}
      style={{ width: size, height: size, animation: "mento-spin 700ms linear infinite", ...style }}
      {...rest}
    />
  );
}
