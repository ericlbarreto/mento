"use client";

import { useMemo } from "react";
import { sanitizeHtml } from "../../sanitize";
import type { RendererProps } from "../types";

/** Handwritten-style block: board font, sizes tuned for Caveat (small x-height). */
export const boardTextClass =
  "font-(family-name:--font-board) text-[26px] leading-snug text-(--ink) [&_h1]:text-[46px] [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:text-[38px] [&_h2]:font-bold [&_h3]:text-[32px] [&_h3]:font-bold [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:list-decimal [&_ol]:pl-7 [&_b]:font-bold";

export function TextRenderer({ element }: RendererProps<"text">) {
  const { html } = element.data;
  const clean = useMemo(() => (element.author === "tutor" ? sanitizeHtml(html) : ""), [html, element.author]);
  // Student-authored text is always plain text, never HTML.
  if (element.author === "student") return <p className={boardTextClass}>{html}</p>;
  return <div className={boardTextClass} dangerouslySetInnerHTML={{ __html: clean }} />;
}
