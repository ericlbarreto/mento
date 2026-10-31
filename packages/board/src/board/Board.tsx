"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import type { Column } from "@mento/contracts";
import { type RendererMap, basicRenderers } from "../renderers";
import { type BoardStore, useBoardColumn } from "../store";
import {
  type BoardEnv,
  BoardEnvProvider,
  BoardWriterProvider,
  type VerificationEnv,
} from "./context";
import {
  type BoardEditingEnv,
  type BoardEditor,
  BoardEditStateProvider,
  BoardEditorProvider,
} from "./editing/context";
import { columnLabel, useEditor } from "./editing/useEditor";
import { UndoToast } from "./editing/UndoToast";
import { ElementFrame } from "./ElementFrame";
import { Pen } from "./Pen";
import { PAPER_TILE_PX, useCanvasCamera } from "./useCanvasCamera";
import { createBoardWriter } from "./writer";

// Fixed widths: on the canvas the world has no width to be a percentage of.
const COLUMN_PX: Record<Column, number> = { main: 680, visuals: 560, side: 400 };
/** World padding (p-8) on each side of the main column, for the first camera fit. */
const WORLD_PAD_PX = 32;

/** Stitch's dotted notebook paper; size and position follow the camera. */
const paperDots =
  "radial-gradient(color-mix(in srgb, var(--ink-soft) 45%, transparent) 1.2px, transparent 1.2px)";

const controlButton =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-(--radius-pill) px-2 text-sm font-bold text-(--ink) outline-none transition-colors duration-(--dur-fast) hover:bg-(--mento-blue-soft) focus-visible:shadow-(--focus-ring)";

export interface BoardProps {
  store: BoardStore;
  /** Merged over the basic renderers. */
  renderers?: RendererMap;
  /** Applied to the viewport. */
  className?: string;
  /** See BoardEnv.assetBaseUrl. */
  assetBaseUrl: string;
  onWarning?: (message: string) => void;
  /** See BoardEnv.verification. */
  verification?: VerificationEnv;
  /** The student may select, delete and move blocks (plan F). Absent = read-only board. */
  editing?: BoardEditingEnv;
}

/**
 * The whiteboard as a pannable canvas: a clipped viewport and a "world" (the three columns side by side, natural
 * height) moved with a transform. Drag the background, scroll or use the arrows to pan; ctrl/⌘ + wheel or pinch to
 * zoom. The camera follows the tutor's newest element unless the student just moved it (docs/16 §5.1).
 * Live tutor text is written by a pen, one element after another (writer.ts); restored boards appear at once.
 */
export function Board({
  store,
  renderers,
  className,
  assetBaseUrl,
  onWarning,
  verification,
  editing,
}: BoardProps) {
  const hintId = useId();
  const map = useMemo(() => ({ ...basicRenderers, ...renderers }), [renderers]);
  const env = useMemo<BoardEnv>(
    () => ({ assetBaseUrl, onWarning, verification }),
    [assetBaseUrl, onWarning, verification],
  );
  const writer = useMemo(() => createBoardWriter(store), [store]);
  const penRef = useRef<HTMLDivElement>(null);
  const { viewportRef, worldRef, paperRef, following, controls } = useCanvasCamera(
    store,
    COLUMN_PX.main + 2 * WORLD_PAD_PX,
    writer,
  );
  const { editor, dragging, announcement, barRef, ghostRef } = useEditor({
    store,
    writer,
    editing,
    openQuestionId: verification?.openElementId ?? null,
    viewportRef,
    worldRef,
    camera: controls,
  });
  const lockedIds = editing?.lockedIds;
  const openQuestionId = verification?.openElementId ?? null;
  const editState = useMemo(
    () => (lockedIds ? { lockedIds, openQuestionId } : null),
    [lockedIds, openQuestionId],
  );
  useEffect(() => {
    const world = worldRef.current;
    const pen = penRef.current;
    if (!world || !pen) return;
    return writer.attach(world, pen);
  }, [writer, worldRef]);

  return (
    <BoardEnvProvider value={env}>
      <BoardWriterProvider value={writer}>
        <BoardEditorProvider value={editing ? editor : null}>
          <BoardEditStateProvider value={editState}>
            <div
              ref={viewportRef}
              tabIndex={0}
              aria-label="Quadro"
              aria-describedby={hintId}
              role="region"
              className={`relative h-full touch-none overflow-clip outline-none cursor-grab focus-visible:shadow-(--focus-ring) data-panning:cursor-grabbing data-panning:select-none [&[data-panning]_*]:cursor-grabbing! [&[data-space]_*]:cursor-grab! ${className ?? ""}`}
            >
              <div
                ref={paperRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-(--paper)"
                style={{
                  backgroundImage: paperDots,
                  backgroundSize: `${PAPER_TILE_PX}px ${PAPER_TILE_PX}px`,
                }}
              />
              <div
                ref={worldRef}
                data-board-world
                className="absolute top-0 left-0 flex w-max origin-top-left items-start gap-10 p-8 pb-16 will-change-transform [&_:where([data-element-id])]:cursor-auto"
              >
                <BoardColumn
                  store={store}
                  column="main"
                  renderers={map}
                  editor={editing ? editor : null}
                  dragging={dragging}
                />
                <BoardColumn
                  store={store}
                  column="visuals"
                  renderers={map}
                  editor={editing ? editor : null}
                  dragging={dragging}
                />
                <BoardColumn
                  store={store}
                  column="side"
                  renderers={map}
                  editor={editing ? editor : null}
                  dragging={dragging}
                />
                <Pen ref={penRef} />
                {/* Drag feedback, placed by the editor in world coordinates. */}
                <div
                  ref={barRef}
                  aria-hidden
                  className="pointer-events-none absolute z-10 hidden h-[3px] rounded-full bg-(--mento-blue)"
                />
                <div
                  ref={ghostRef}
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 z-20"
                />
              </div>
              <p id={hintId} className="sr-only">
                Arraste o fundo ou use as setas para mover o quadro; mais e menos mudam o zoom.
                {editing && " Num bloco: Delete apaga, M move."}
              </p>
              <p aria-live="polite" className="sr-only" key={announcement.n}>
                {announcement.text}
              </p>
              {editing && <UndoToast outbox={editing.outbox} onUndo={editor.undo} />}
              <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                <div
                  data-board-control
                  role="toolbar"
                  aria-label="Zoom do quadro"
                  className="flex items-center gap-0.5 rounded-(--radius-pill) bg-(--card) p-1 shadow-(--shadow-card)"
                >
                  <button
                    type="button"
                    className={controlButton}
                    onClick={controls.zoomOut}
                    aria-label="Diminuir zoom"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={controlButton}
                    onClick={controls.zoomIn}
                    aria-label="Aumentar zoom"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={controlButton}
                    onClick={controls.recenter}
                    aria-label="Centralizar no conteúdo mais recente"
                  >
                    Centralizar
                  </button>
                </div>
                {!following && (
                  <button
                    type="button"
                    data-board-control
                    onClick={controls.resume}
                    className="rounded-(--radius-pill) bg-(--mento-blue) px-4 py-1.5 text-sm font-bold text-white shadow-(--shadow-float) outline-none transition-colors duration-(--dur-fast) hover:bg-(--mento-blue-hover) focus-visible:shadow-(--focus-ring)"
                  >
                    Voltar para a aula
                  </button>
                )}
              </div>
            </div>
          </BoardEditStateProvider>
        </BoardEditorProvider>
      </BoardWriterProvider>
    </BoardEnvProvider>
  );
}

function BoardColumn({
  store,
  column,
  renderers,
  editor,
  dragging,
}: {
  store: BoardStore;
  column: Column;
  renderers: RendererMap;
  editor: BoardEditor | null;
  dragging: boolean;
}) {
  const ids = useBoardColumn(store, column);
  // A student edit changed this column: slide the blocks from where they were.
  useLayoutEffect(() => editor?.flip.play(), [editor, ids]);
  // Empty side columns take no room (main always holds its place), except as a drop zone while a block is moved.
  if (ids.length === 0 && column !== "main" && !dragging) return null;
  return (
    <section
      aria-label={columnLabel[column]}
      data-column={column}
      className="flex shrink-0 flex-col gap-5 rounded-(--radius-md) transition-colors duration-(--dur-fast) data-drop-target:bg-[color-mix(in_srgb,var(--mento-blue-soft)_55%,transparent)]"
      style={{ width: COLUMN_PX[column] }}
    >
      {ids.map((id) => (
        <ElementFrame key={id} store={store} id={id} renderers={renderers} />
      ))}
      {dragging && ids.length === 0 && (
        <div
          aria-hidden
          data-drop-zone
          className="flex min-h-40 items-center justify-center rounded-(--radius-md) border-2 border-dashed border-(--mento-blue) text-sm font-bold text-(--mento-blue-strong)"
        >
          Solte aqui
        </div>
      )}
    </section>
  );
}
