"use client";

import { useSyncExternalStore } from "react";
import type { EditOutbox } from "./outbox";

/**
 * "Bloco apagado · Desfazer", top-center of the board (never near the caption or the orb). Open while the delete
 * is held (6 s); hover or focus stops the clock. Ctrl/⌘+Z does the same as the button.
 */
export function UndoToast({ outbox, onUndo }: { outbox: EditOutbox; onUndo(): void }) {
  const held = useSyncExternalStore(outbox.subscribe, outbox.held, () => null);
  if (!held) return null;
  return (
    <div
      data-board-control
      role="status"
      onPointerEnter={outbox.pauseTimer}
      onPointerLeave={outbox.resumeTimer}
      onFocus={outbox.pauseTimer}
      onBlur={outbox.resumeTimer}
      className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-(--radius-pill) bg-(--ink) py-1.5 pr-1.5 pl-4 text-sm text-(--paper) shadow-(--shadow-pop) motion-safe:animate-[mento-drop-in_var(--dur-base)_var(--ease-out)]"
    >
      <span>Bloco apagado</span>
      <button
        type="button"
        onClick={onUndo}
        aria-keyshortcuts="Control+Z Meta+Z"
        className="min-h-11 rounded-(--radius-pill) px-4 font-bold text-white outline-none transition-colors duration-(--dur-fast) hover:bg-white/15 focus-visible:shadow-(--focus-ring)"
      >
        Desfazer
      </button>
    </div>
  );
}
