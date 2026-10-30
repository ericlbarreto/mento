"use client";

import { type ComponentType, memo } from "react";
import type { RendererMap, RendererProps } from "../renderers";
import { type BoardStore, useBoardElement } from "../store";

const markerBg = { yellow: "var(--marker-yellow)", blue: "var(--marker-blue)" } as const;

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
  if (!element) return null;
  const Renderer = renderers[element.type] as ComponentType<RendererProps> | undefined;
  // Stand-in until the hand-drawn marker (T5): the latest highlight tints the element.
  const highlight = element.annotations.findLast((a) => a.kind === "highlight");
  return (
    <div
      data-element-id={element.id}
      data-element-type={element.type}
      data-author={element.author}
      data-status={element.status}
      tabIndex={0}
      className="relative rounded-(--radius-sm) px-2 py-1 outline-none transition-[background-color,box-shadow] duration-(--dur-slow) ease-(--ease-out) focus-visible:shadow-(--focus-ring)"
      style={highlight ? { backgroundColor: markerBg[highlight.color as keyof typeof markerBg] } : undefined}
    >
      {Renderer ? <Renderer element={element} /> : null}
      {element.outside_material && (
        <span className="mt-1 inline-flex rounded-(--radius-sm) bg-(--accent-soft) px-2 py-0.5 text-xs font-bold text-(--accent-ink)">
          Fora do material
        </span>
      )}
    </div>
  );
});
