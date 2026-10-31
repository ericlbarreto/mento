"use client";

import { useEffect, useMemo, useState } from "react";
import { useBoardEnv } from "../../board/context";
import { sanitizeSvg } from "../../sanitize";
import { clampDimensions, resolveImageUrl } from "./imageUrl";
import type { RendererProps } from "../types";

/**
 * `draw` element (image or svg). The box is sized by max_dimensions from the first frame, so the
 * placeholder → drawing swap never shifts the layout; the drawing fades in over the placeholder.
 */
export function DrawRenderer({ element }: RendererProps<"image" | "svg">) {
  const { prompt, url, svg } = element.data;
  const dim = clampDimensions(element.data.max_dimensions);
  const ready = element.status === "ready";
  const { assetBaseUrl, onWarning } = useBoardEnv();
  const [loaded, setLoaded] = useState(false);
  /** The URL that failed to load (e.g. a fixture image the server does not have): placeholder, never a broken image. */
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const wantsImage = ready && element.type === "image" && !!url;
  const src = useMemo(
    () => (wantsImage && url && assetBaseUrl ? resolveImageUrl(url, assetBaseUrl) : null),
    [wantsImage, url, assetBaseUrl],
  );
  const rejected = wantsImage && !!assetBaseUrl && src === null;
  useEffect(() => {
    if (rejected) onWarning?.(`draw_result for "${element.id}": image URL rejected (not on the asset origin)`);
  }, [rejected, element.id, onWarning]);
  const cleanSvg = useMemo(() => (ready && element.type === "svg" && svg ? sanitizeSvg(svg) : ""), [ready, element.type, svg]);
  const broken = src !== null && brokenSrc === src;
  const shown = (src !== null && loaded && !broken) || cleanSvg !== "";
  // A rejected, missing or unloadable drawing keeps the placeholder card, captioned with what it would show.
  const failed = rejected || broken || (ready && !wantsImage && cleanSvg === "");

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
        {failed ? (
          <span className="flex flex-col items-center gap-1 px-4 text-center">
            <span className="font-(family-name:--font-board) text-[26px] text-(--ink-soft)">Não consegui desenhar</span>
            <span className="line-clamp-2 text-sm text-(--ink-soft)">{prompt}</span>
          </span>
        ) : (
          <span className="font-(family-name:--font-board) text-[26px] text-(--ink-soft) motion-safe:animate-pulse">Desenhando…</span>
        )}
      </div>
      {src && !broken && (
        <img
          src={src}
          alt={prompt}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setBrokenSrc(src);
            onWarning?.(`draw_result for "${element.id}": image failed to load`);
          }}
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
