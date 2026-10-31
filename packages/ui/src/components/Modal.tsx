"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { IconX } from "./icons";
import { useDialog } from "./useDialog";

export type ModalProps = {
  open: boolean;
  /** Called on Escape, on the close button and on an overlay click (when `closeOnOverlay`). */
  onClose: () => void;
  title: ReactNode;
  /** Supporting text under the title; also the dialog's accessible description. */
  description?: ReactNode;
  /** Media above the title, e.g. the mascot in a circle and a status badge (Stitch S6). */
  header?: ReactNode;
  children?: ReactNode;
  /** Action row at the bottom (primary action first). */
  footer?: ReactNode;
  /** Show the X button. Off for blocking states such as "Sessão pausada", where the footer is the way out. */
  showClose?: boolean;
  closeOnOverlay?: boolean;
  /** Element to focus on open; defaults to the first focusable inside. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
};

/**
 * Centered card over a navy veil that blurs the page (Stitch S6 paused/ended). role="dialog", aria-modal,
 * focus trap, Escape closes, focus returns to the opener. Rendered in place (no portal): mount it outside
 * transformed or overflow-clipped ancestors.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  header,
  children,
  footer,
  showClose = false,
  closeOnOverlay = true,
  initialFocusRef,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialog(open, onClose, panelRef, initialFocusRef);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={closeOnOverlay ? onClose : undefined}
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
          "relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[36rem] flex-col items-center gap-4 overflow-y-auto",
          "rounded-(--radius-xl) border border-(--line) bg-(--card) px-6 py-8 text-center text-(--ink) shadow-(--shadow-float) outline-none sm:px-12 sm:py-10",
          "animate-[mento-pop-in_var(--dur-base)_var(--ease-out)]",
          className,
        )}
      >
        {showClose && (
          <IconButton aria-label="Fechar" variant="ghost" size="sm" onClick={onClose} className="absolute right-4 top-4">
            <IconX />
          </IconButton>
        )}
        {header}
        <h2 id={titleId} className="text-2xl font-extrabold leading-tight text-balance">
          {title}
        </h2>
        {description && (
          <div id={descId} className="max-w-[48ch] text-base leading-relaxed text-(--ink-soft) text-pretty">
            {description}
          </div>
        )}
        {children}
        {footer && <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">{footer}</div>}
      </div>
    </div>
  );
}
