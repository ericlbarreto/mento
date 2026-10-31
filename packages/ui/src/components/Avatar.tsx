import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";
import { initials } from "./initials";

export type AvatarSize = "sm" | "md" | "lg";

const sizes: Record<AvatarSize, string> = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-[13px]",
  lg: "size-12 text-base",
};

export type AvatarProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
  /** Full name; the avatar shows its initials. No photos (plan §6: no invented student images). */
  name: string;
  size?: AvatarSize;
  /** Hide from assistive tech when the name is already printed next to it. */
  decorative?: boolean;
};

/** Round initials badge on the soft brand tint. */
export function Avatar({ name, size = "md", decorative = false, className, ...rest }: AvatarProps) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-extrabold tracking-wide",
        "bg-(--mento-blue-soft) text-(--mento-blue-strong) ring-2 ring-(--card)",
        sizes[size],
        className,
      )}
      {...rest}
    >
      {initials(name)}
    </span>
  );
}
