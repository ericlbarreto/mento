"use client";

import { useMemo, useState } from "react";
import { sanitizeSvg } from "../../sanitize";
import type { RendererProps } from "../types";

/** Only http(s) images; relative URLs resolve against the page origin. */
export function resolveImageUrl(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * `draw` element (image or svg). The box is sized by max_dimensions from the first frame, so the
 * placeholder → drawing swap never shifts the layout; the drawing fades in over the placeholder.
 */
export function DrawRenderer({ element }: RendererProps<"image" | "svg">) {
  const { max_dimensions: dim, prompt, url, svg } = element.data;
  const ready = element.status === "ready";
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => (ready && element.type === "image" && url ? resolveImageUrl(url) : null), [ready, element.type, url]);
  const cleanSvg = useMemo(() => (ready && element.type === "svg" && svg ? sanitizeSvg(svg) : ""), [ready, element.type, svg]);
  const shown = (src !== null && loaded) || cleanSvg !== "";
  const failed = ready && src === null && cleanSvg === "";

  return (
    <figure
      className="relative w-full overflow-hidden rounded-(--radius-md) border border-(--line) bg-(--card)"
      style={{ maxWidth: dim.w, aspectRatio: `${dim.w} / ${dim.h}` }}
      aria-busy={!ready}
    >
      <div
        aria-hidden={shown}
        className={`absolute inset-0 flex items-center justify-center bg-(--paper-2) transition-opacity duration-(--dur-slow) ease-(--ease-out) ${shown ? "opacity-0" : "opacity-100"}`}
      >
        <span className="font-(family-name:--font-board) text-[26px] text-(--ink-soft) motion-safe:animate-pulse">
          {failed ? "Não consegui desenhar" : "Desenhando…"}
        </span>
      </div>
      {src && (
        <img
          src={src}
          alt={prompt}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 size-full object-contain transition-opacity duration-(--dur-slow) ease-(--ease-out) ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {cleanSvg && (
        <div
          role="img"
          aria-label={prompt}
          className="absolute inset-0 p-2 [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: cleanSvg }}
        />
      )}
    </figure>
  );
}
