"use client";

import type { RendererProps } from "../types";

/** Plain-text fallback (no KaTeX in the MVP: the demo has no math). */
export function LatexRenderer({ element }: RendererProps<"latex">) {
  return (
    <code className="block font-mono text-lg whitespace-pre-wrap text-(--ink)" data-latex={element.data.latex}>
      {element.data.latex}
    </code>
  );
}
