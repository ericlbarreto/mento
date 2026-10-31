"use client";

import { useEffect, useRef, type RefObject } from "react";
import { FOCUSABLE, trapTarget } from "./focusTrap";

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/**
 * Modal behaviour shared by Modal and Drawer while `open`: moves focus inside (initialFocus, else the first
 * focusable, else the panel), traps Tab, closes on Escape, locks page scroll, and gives focus back to the
 * element that opened it.
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initialFocusRef?.current ?? focusablesIn(panel)[0] ?? panel;
    first.focus({ preventScroll: true });

    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusablesIn(panel);
      const target = trapTarget(items.indexOf(document.activeElement as HTMLElement), items.length, event.shiftKey);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
      } else if (target !== null) {
        event.preventDefault();
        items[target]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, panelRef, initialFocusRef]);
}
