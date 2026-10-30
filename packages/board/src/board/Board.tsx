"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Column } from "../protocol";
import { type RendererMap, basicRenderers } from "../renderers";
import { type BoardStore, useBoardColumn } from "../store";
import { type BoardEnv, BoardEnvProvider } from "./context";
import { ElementFrame } from "./ElementFrame";

/** Pause auto-scroll for this long after the student scrolls by hand. */
const MANUAL_SCROLL_IDLE_MS = 4000;

const columnWidth: Record<Column, string> = {
  main: "w-[min(680px,88vw)]",
  visuals: "w-[min(560px,88vw)]",
  side: "w-[min(400px,88vw)]",
};

const columnLabel: Record<Column, string> = {
  main: "Explicação",
  visuals: "Imagens",
  side: "Anotações",
};

export interface BoardProps {
  store: BoardStore;
  /** Merged over the basic renderers. */
  renderers?: RendererMap;
  className?: string;
  /** See BoardEnv.assetBaseUrl. */
  assetBaseUrl: string;
  onWarning?: (message: string) => void;
}

/** The whiteboard: columns left to right, horizontal scroll as they fill (docs/16 §5.1). */
export function Board({ store, renderers, className, assetBaseUrl, onWarning }: BoardProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const manualAt = useRef(0);
  const map = useMemo(() => ({ ...basicRenderers, ...renderers }), [renderers]);
  const env = useMemo<BoardEnv>(() => ({ assetBaseUrl, onWarning }), [assetBaseUrl, onWarning]);

  // Smooth auto-scroll to the newest element, unless the student is scrolling.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = store.subscribeAdded((id) => {
      clearTimeout(timer);
      // Wait for React to commit the new element.
      timer = setTimeout(() => {
        if (Date.now() - manualAt.current < MANUAL_SCROLL_IDLE_MS) return;
        const el = scrollerRef.current?.querySelector(`[data-element-id="${CSS.escape(id)}"]`);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          inline: "center",
          block: "nearest",
        });
      }, 50);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [store]);

  const markManual = () => {
    manualAt.current = Date.now();
  };

  return (
    <BoardEnvProvider value={env}>
      <div
        ref={scrollerRef}
        onWheel={markManual}
        onTouchMove={markManual}
        onPointerDown={markManual}
        onKeyDown={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "PageDown" || e.key === "PageUp") markManual();
        }}
        className={`flex h-full gap-10 overflow-x-auto overflow-y-hidden bg-(--paper) px-8 py-8 ${className ?? ""}`}
        aria-label="Quadro"
        role="region"
      >
        <BoardColumn store={store} column="main" renderers={map} />
        <BoardColumn store={store} column="visuals" renderers={map} />
        <BoardColumn store={store} column="side" renderers={map} />
      </div>
    </BoardEnvProvider>
  );
}

function BoardColumn({
  store,
  column,
  renderers,
}: {
  store: BoardStore;
  column: Column;
  renderers: RendererMap;
}) {
  const ids = useBoardColumn(store, column);
  // Empty side columns take no room; main always holds its place.
  if (ids.length === 0 && column !== "main") return null;
  return (
    <section
      aria-label={columnLabel[column]}
      data-column={column}
      className={`flex h-full shrink-0 flex-col gap-5 overflow-y-auto pb-24 ${columnWidth[column]}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}
    >
      {ids.map((id) => (
        <ElementFrame key={id} store={store} id={id} renderers={renderers} />
      ))}
    </section>
  );
}
