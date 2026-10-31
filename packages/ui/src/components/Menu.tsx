"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx, transition } from "./cx";
import { menuIndex } from "./focusTrap";
import { IconButton } from "./IconButton";
import { IconMoreVertical } from "./icons";
import { INERT_LABEL } from "./inert";

export type MenuItem = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** "danger" = destructive action in red (e.g. "Encerrar conversa atual"). */
  tone?: "default" | "danger";
  /** Drawn but not wired (plan §6): focusable, aria-disabled, "Em breve", selecting does nothing. */
  inert?: boolean;
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
  onSelect?: () => void;
};

export type MenuProps = {
  items: MenuItem[];
  /** Accessible name of the trigger, e.g. "Opções da sessão". */
  label: string;
  /** Uppercase header inside the popover. */
  heading?: string;
  /** Trigger icon; defaults to the vertical dots. */
  triggerIcon?: ReactNode;
  /** Side the popover aligns to, under the trigger. */
  align?: "start" | "end";
  className?: string;
};

/**
 * Popover menu anchored to an icon trigger (Stitch S5 "Opções da sessão"). Menu button pattern: the trigger has
 * aria-haspopup/aria-expanded; Arrow keys, Home and End move between items; Enter/Space select; Escape and Tab
 * close; a click outside closes. Focus returns to the trigger when it closes from the keyboard.
 */
export function Menu({
  items,
  label,
  heading = "Opções da sessão",
  triggerIcon,
  align = "end",
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const pendingFocus = useRef<number | null>(null);

  const focusItem = (index: number) => itemRefs.current[index]?.focus();

  useEffect(() => {
    if (!open) return;
    if (pendingFocus.current !== null) {
      focusItem(pendingFocus.current);
      pendingFocus.current = null;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const openAt = (index: number) => {
    pendingFocus.current = index;
    setOpen(true);
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(items.length - 1);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const next = menuIndex(current, event.key, items.length);
    if (next !== null) {
      event.preventDefault();
      focusItem(next);
    }
  };

  const select = (item: MenuItem) => {
    if (item.inert) return;
    close(true);
    item.onSelect?.();
  };

  return (
    <div ref={rootRef} className={cx("relative inline-flex", className)}>
      <IconButton
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        variant={open ? "primary" : "secondary"}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
      >
        {triggerIcon ?? <IconMoreVertical />}
      </IconButton>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cx(
            "absolute top-full z-40 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-(--radius-lg) border border-(--line) bg-(--card) py-2 shadow-(--shadow-float)",
            "animate-[mento-drop-in_var(--dur-fast)_var(--ease-out)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {heading && (
            <div
              aria-hidden="true"
              className="mb-1 border-b border-(--line) px-4 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-(--ink-soft)"
            >
              {heading}
            </div>
          )}
          {items.map((item, index) => {
            const danger = item.tone === "danger";
            return (
              <div key={item.id} role="none" className="contents">
                {item.separatorBefore && <div role="separator" className="my-1 border-t border-(--line)" />}
                <button
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.inert || undefined}
                  title={item.inert ? INERT_LABEL : undefined}
                  onClick={() => select(item)}
                  className={cx(
                    "group flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none",
                    transition,
                    "focus-visible:bg-(--mento-blue-soft) focus-visible:shadow-[inset_3px_0_0_var(--mento-blue)]",
                    item.inert
                      ? "cursor-not-allowed opacity-60"
                      : danger
                        ? "hover:bg-[color-mix(in_srgb,var(--danger-soft)_45%,var(--card))]"
                        : "hover:bg-(--paper-2)",
                  )}
                >
                  {item.icon && (
                    <span
                      aria-hidden="true"
                      className={cx(
                        "flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]",
                        danger ? "bg-(--danger-soft) text-(--danger)" : "bg-(--paper-2) text-(--ink-soft)",
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col justify-center self-center">
                    <span className={cx("text-[15px] font-bold leading-tight", danger ? "text-(--danger)" : "text-(--ink)")}>
                      {item.label}
                      {item.inert && (
                        <span className="ml-2 inline-block whitespace-nowrap rounded-(--radius-pill) bg-(--paper-2) px-2 py-0.5 align-middle text-[11px] font-bold text-(--ink-soft)">
                          {INERT_LABEL}
                        </span>
                      )}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 text-[13px] leading-snug text-(--ink-soft)">{item.description}</span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
