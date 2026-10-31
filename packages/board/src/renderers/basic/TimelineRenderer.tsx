"use client";

import type { RendererProps } from "../types";

/** Deterministic timeline: exact dates from the args, never model-drawn text (docs/16 §4). */
export function TimelineRenderer({ element }: RendererProps<"timeline">) {
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-(--ink) pl-6 font-(family-name:--font-board) text-(--ink)">
      {element.data.events.map((ev, i) => (
        <li key={`${i}-${ev.date}`} className="relative" data-timeline-index={i}>
          <span aria-hidden className="absolute top-3 -left-[31px] size-3 rounded-full bg-(--mento-blue)" />
          <span className="block text-[32px] leading-tight font-bold text-(--mento-blue-strong)" data-timeline-date>
            {ev.date}
          </span>
          <span className="block text-[26px] leading-snug">{ev.label}</span>
        </li>
      ))}
    </ol>
  );
}
