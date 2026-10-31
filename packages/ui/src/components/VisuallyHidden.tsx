import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";

/** Text for screen readers only. */
export function VisuallyHidden({ className, ...rest }: ComponentPropsWithRef<"span">) {
  return <span className={cx("sr-only", className)} {...rest} />;
}
