"use client";

import { type ComponentType, memo, useMemo, useRef } from "react";
import type { RendererMap, RendererProps } from "../renderers";
import { type Annotation, type BoardStore, type HighlightColor, useBoardElement } from "../store";
import { CircleLayer } from "./CircleLayer";

// Board markers: yellow/blue are design tokens; green/pink are local soft tints until @mento/ui adds them.
const markerBg: Record<HighlightColor, string> = {
  yellow: "var(--marker-yellow)",
  blue: "var(--marker-blue)",
  green: "#cdeccf",
  pink: "#fbd3e4",
};

/**
 * One board element: subscribes to its own id only, so a new element never re-renders this one.
 * The data attributes are the hooks for click-and-ask and annotations (later tracks).
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
  const annotations = element?.annotations;
  const circles = useMemo(
    () => (annotations ?? []).filter((a): a is Extract<Annotation, { kind: "circle" }> => a.kind === "circle"),
    [annotations],
  );
  if (!element) return null;
  const Renderer = renderers[element.type] as ComponentType<RendererProps> | undefined;
  // Stand-in until the hand-drawn marker (T5): the latest highlight tints the element.
  const highlight = element.annotations.findLast((a) => a.kind === "highlight" && !a.shape_id);
  return (
    <div
      data-element-id={element.id}
      data-element-type={element.type}
      data-author={element.author}
      data-status={element.status}
      tabIndex={0}
      className="relative rounded-(--radius-sm) px-2 py-1 outline-none transition-[background-color,box-shadow] duration-(--dur-slow) ease-(--ease-out) focus-visible:shadow-(--focus-ring)"
      style={highlight?.kind === "highlight" ? { backgroundColor: markerBg[highlight.color] } : undefined}
    >
      <div ref={contentRef}>{Renderer ? <Renderer element={element} /> : null}</div>
      <CircleLayer contentRef={contentRef} circles={circles} version={element.data} />
      {element.outside_material && (
        <span className="mt-1 inline-flex rounded-(--radius-sm) bg-(--accent-soft) px-2 py-0.5 text-xs font-bold text-(--accent-ink)">
          Fora do material
        </span>
      )}
    </div>
  );
});
