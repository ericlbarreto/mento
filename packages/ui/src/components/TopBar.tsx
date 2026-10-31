import type { ComponentPropsWithRef, ReactNode } from "react";
import { Avatar } from "./Avatar";
import { cx, focusRing, transition } from "./cx";
import { INERT_LABEL, inertClasses, inertProps } from "./inert";
import { VisuallyHidden } from "./VisuallyHidden";

export type TopBarNavItem = {
  label: string;
  href?: string;
  /** Current page: blue pill, aria-current="page". */
  active?: boolean;
  /** Drawn but not wired (plan §6): "Em breve" tooltip, no navigation. */
  inert?: boolean;
};

export type TopBarProps = Omit<ComponentPropsWithRef<"header">, "children"> & {
  /** Where the logo links to. */
  logoHref?: string;
  logoSrc?: string;
  /** @deprecated The main nav was removed from the student shell; ignored. */
  nav?: TopBarNavItem[];
  /** Class chip, e.g. "8º ano". Only real data: never an invented class name (plan §3 S1). */
  classLabel?: string;
  /** The current student; shows the name and an initials avatar. */
  studentName?: string;
  /** Slot under the student name, e.g. a "Trocar aluno" link. */
  studentAction?: ReactNode;
  /** Stick to the top of the scroll container (default). Turn off for previews. */
  sticky?: boolean;
};

const navItem = "inline-flex h-10 items-center rounded-(--radius-pill) px-4 text-[15px] font-bold";

function NavLink({ item }: { item: TopBarNavItem }) {
  if (item.inert) {
    return (
      <a role="link" tabIndex={0} className={cx(navItem, "text-(--ink-soft)", focusRing, inertClasses)} {...inertProps()}>
        {item.label}
        <VisuallyHidden>({INERT_LABEL})</VisuallyHidden>
      </a>
    );
  }
  return (
    <a
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cx(
        navItem,
        transition,
        focusRing,
        item.active
          ? "bg-(--mento-blue) text-white hover:bg-(--mento-blue-strong)"
          : "text-(--ink-soft) hover:bg-(--mento-blue-soft) hover:text-(--ink)",
      )}
    >
      {item.label}
    </a>
  );
}

/** Student shell header (Stitch S1–S7): logo, class chip, student name and avatar. */
export function TopBar({
  logoHref = "/",
  logoSrc = "/brand/logo-wordmark.png",
  classLabel,
  studentName,
  studentAction,
  sticky = true,
  className,
  ...rest
}: TopBarProps) {
  return (
    <header
      className={cx(
        sticky && "sticky top-0 z-40",
        "w-full bg-[color-mix(in_srgb,var(--paper)_85%,transparent)] shadow-[0_1px_8px_rgb(22_34_80/0.04)] backdrop-blur-md",
        className,
      )}
      {...rest}
    >
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-6 lg:gap-10">
          <a href={logoHref} className={cx("shrink-0 rounded-(--radius-sm)", focusRing)}>
            <img src={logoSrc} alt="Mento, início" className="h-7 w-auto sm:h-8" />
          </a>
        </div>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {classLabel && (
            <span className="hidden h-7 items-center gap-1.5 rounded-(--radius-pill) bg-(--paper-2) px-3 text-[13px] font-bold text-(--ink-soft) sm:inline-flex">
              <span aria-hidden="true" className="size-2 rounded-full bg-(--mento-blue)" />
              {classLabel}
            </span>
          )}
          {studentName && (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex min-w-0 flex-col items-end leading-tight">
                <span className="max-w-[16ch] truncate text-[15px] font-bold text-(--ink)">{studentName}</span>
                {studentAction && <span className="text-xs font-semibold">{studentAction}</span>}
              </div>
              <Avatar name={studentName} decorative />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
