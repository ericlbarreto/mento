"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { IconX } from "./icons";
import { useDialog } from "./useDialog";

export type DrawerProps = {
  open: boolean;
  /** Called on Escape, the X button and an overlay click. */
  onClose: () => void;
  title: ReactNode;
  /** Small uppercase label above the title, e.g. "Histórico de estudos". */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Content between the header and the scroll area, e.g. a search box and filter chips. */
  toolbar?: ReactNode;
  /** Scrollable body. */
  children?: ReactNode;
  /** Pinned bottom bar, e.g. "Iniciar nova conversa". */
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
};

/**
 * Right side sheet over a navy veil that blurs the page (Stitch S7 history). role="dialog", aria-modal,
 * focus trap, Escape closes, focus returns to the opener. Rendered in place (no portal).
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  toolbar,
  children,
  footer,
  initialFocusRef,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialog(open, onClose, panelRef, initialFocusRef);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-(--overlay) backdrop-blur-(--overlay-blur) animate-[mento-fade-in_var(--dur-base)_var(--ease-out)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex h-full w-full max-w-[40rem] flex-col border-l border-(--line) bg-(--paper-2) text-(--ink) shadow-(--shadow-float) outline-none",
          "animate-[mento-slide-in-right_var(--dur-slow)_var(--ease-out)]",
          className,
        )}
      >
        <div className="flex flex-col gap-4 border-b border-(--line) bg-(--paper) px-5 pb-5 pt-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              {eyebrow && (
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-(--mento-blue)">{eyebrow}</span>
              )}
              <h2 id={titleId} className="text-2xl font-extrabold leading-tight text-balance">
                {title}
              </h2>
              {description && (
                <p id={descId} className="text-[15px] text-(--ink-soft)">
                  {description}
                </p>
              )}
            </div>
            <IconButton aria-label="Fechar" variant="secondary" onClick={onClose} className="shrink-0">
              <IconX />
            </IconButton>
          </div>
          {toolbar}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-(--line) bg-(--paper) px-5 py-4 sm:px-8">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
