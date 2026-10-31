"use client";

import { type ComponentType, memo, useLayoutEffect, useMemo, useRef } from "react";
import type { RendererMap, RendererProps } from "../renderers";
import { type Annotation, type BoardStore, useBoardElement } from "../store";
import { CircleLayer } from "./CircleLayer";
import { useBoardWriter } from "./context";
import { HighlightLayer } from "./HighlightLayer";

/**
 * One board element: subscribes to its own id only, so a new element never re-renders this one.
 * The data attributes are the hooks for click-and-ask and annotations. While the board's pen writes it, the
 * frame carries data-writing (badges wait) or data-queued (not started: invisible, its space kept).
 */
export const ElementFrame = memo(function ElementFrame({
  store,
  id,
  renderers,
}: {
  store: BoardStore;
  id: string;
  renderers: RendererMap;
}) {
  const element = useBoardElement(store, id);
  const contentRef = useRef<HTMLDivElement>(null);
  const writer = useBoardWriter();
  const data = element?.data;
  // Before paint: a block the pen has not written yet starts hidden.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!writer || !content || data === undefined) return;
    return writer.mount(id, content, data);
  }, [writer, id, data]);
  const annotations = element?.annotations;
  const circles = useMemo(
    () => (annotations ?? []).filter((a): a is Extract<Annotation, { kind: "circle" }> => a.kind === "circle"),
    [annotations],
  );
  if (!element) return null;
  const Renderer = renderers[element.type] as ComponentType<RendererProps> | undefined;
  // The latest highlight is the marker on the element.
  const highlight = element.annotations.findLast((a) => a.kind === "highlight");
  // Touching a block that is being written finishes the writing (click-and-ask sees the whole text anyway).
  const finish = () => {
    if (writer?.isWriting(element.id)) writer.finishAll();
  };
  return (
    <div
      data-element-id={element.id}
      data-element-type={element.type}
      data-author={element.author}
      data-status={element.status}
      tabIndex={0}
      onPointerDownCapture={finish}
      onFocus={finish}
      className="group relative rounded-(--radius-sm) px-2 py-1 outline-none transition-[box-shadow] duration-(--dur-slow) ease-(--ease-out) focus-visible:shadow-(--focus-ring) data-queued:opacity-0"
    >
      <div ref={contentRef}>{Renderer ? <Renderer element={element} /> : null}</div>
      {highlight?.kind === "highlight" && (
        <HighlightLayer
          key={highlight.action_id}
          contentRef={contentRef}
          action_id={highlight.action_id}
          color={highlight.color}
          version={element.data}
        />
      )}
      <CircleLayer contentRef={contentRef} circles={circles} version={element.data} />
      {element.outside_material && (
        <span className="mt-1 inline-flex rounded-(--radius-sm) bg-(--accent-soft) px-2 py-0.5 text-xs font-bold text-(--accent-ink) transition-opacity duration-200 group-data-writing:opacity-0">
          Fora do material
        </span>
      )}
    </div>
  );
});
