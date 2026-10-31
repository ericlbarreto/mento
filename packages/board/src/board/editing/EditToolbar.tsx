"use client";

import { useLayoutEffect, useRef } from "react";
import { type BoardEditor, useBoardEditState } from "./context";
import type { EditPermissions } from "./model";

const button =
  "inline-flex size-11 items-center justify-center rounded-(--radius-pill) text-(--ink) outline-none transition-colors duration-(--dur-fast) hover:bg-(--mento-blue-soft) focus-visible:shadow-(--focus-ring)";

/** The selected block's toolbar, with the buttons its state allows (none: no toolbar). */
export function SelectedToolbar({ editor, id }: { editor: BoardEditor; id: string }) {
  // Re-render when the playing turn's blocks or the open question change.
  useBoardEditState();
  const can = editor.permissions(id);
  if (!can || (!can.move && !can.remove)) return null;
  return <EditToolbar editor={editor} id={id} can={can} />;
}

/** Room kept above the toolbar at the top of the board (px on screen). */
const TOP_ROOM_PX = 56;

/**
 * The selected block's toolbar: a pill 8 px above its top-right corner, screen-sized whatever the zoom (it lives in
 * the world and divides by --board-scale). When the block's top is off-screen it sticks to the top of the board,
 * inside the block. Hidden while the pen writes the block and below zoom 0.6.
 */
export function EditToolbar({
  editor,
  id,
  can,
}: {
  editor: BoardEditor;
  id: string;
  can: EditPermissions;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    const frame = bar?.parentElement;
    const viewport = bar?.closest<HTMLElement>("[role=region]");
    if (!bar || !frame || !viewport) return;
    const place = () => {
      const fr = frame.getBoundingClientRect();
      const vr = viewport.getBoundingClientRect();
      const scale = frame.offsetHeight > 0 ? fr.height / frame.offsetHeight : 1;
      const offTop = fr.top - vr.top < TOP_ROOM_PX;
      if (!offTop) {
        bar.style.top = "";
        bar.style.bottom = "100%";
        bar.style.transformOrigin = "100% 100%";
        bar.dataset.placement = "above";
        return;
      }
      const max = Math.max(0, frame.offsetHeight - bar.offsetHeight / scale);
      bar.style.bottom = "";
      bar.style.top = `${Math.min(max, Math.max(0, (vr.top + 8 - fr.top) / scale))}px`;
      bar.style.transformOrigin = "100% 0";
      bar.dataset.placement = "inside";
    };
    place();
    return editor.camera.subscribe(place);
  }, [editor]);

  return (
    <div
      ref={ref}
      data-board-control
      role="toolbar"
      aria-label="Editar bloco"
      className="absolute right-0 z-20 group-data-dragging:hidden group-data-queued:hidden group-data-writing:hidden in-data-zoomed-out:hidden data-[placement=above]:pb-2"
      style={{
        bottom: "100%",
        transform: "scale(calc(1 / var(--board-scale, 1)))",
        transformOrigin: "100% 100%",
      }}
    >
      <div className="flex items-center gap-1 rounded-(--radius-pill) bg-(--card) p-1 shadow-(--shadow-pop)">
        {can.move && (
          <button
            type="button"
            aria-label="Mover bloco"
            title="Mover (arraste, ou tecla M)"
            className={`${button} cursor-grab touch-none active:cursor-grabbing`}
            onPointerDown={(e) => editor.startDrag(e.nativeEvent, id, e.currentTarget)}
            onClick={(e) => {
              // Keyboard activation (Enter / Space) opens the move mode; a pointer moves by dragging.
              if (e.detail === 0) editor.enterMoveMode(id);
            }}
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {[5, 10, 15].flatMap((y) =>
                [7, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
              )}
            </svg>
          </button>
        )}
        {can.remove && (
          <button
            type="button"
            aria-label="Apagar bloco"
            title="Apagar (Delete)"
            className={`${button} hover:text-(--danger)`}
            onClick={() => editor.remove(id, { focusNext: true })}
          >
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L15 5.5M8.5 9v5M11.5 9v5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
