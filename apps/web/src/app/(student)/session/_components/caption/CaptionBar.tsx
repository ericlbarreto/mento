"use client";

// Owner: Person 2. Caption over the orb (Stitch S3): the line the tutor is saying, word by word (speech_alignment
// in voice, the text clock otherwise), its source chips ("Livro · p.N", opening the PDF is inert until Person
// 1's files route) and the "Fora do material didático" chip (AGENTS.md rule 7).
import { useEffect, useMemo, useState } from "react";
import type { Caption } from "@mento/board";
import { Chip } from "@mento/ui";
import { sourceLabel } from "../sessionModel";

export function CaptionBar({
  caption,
  speaking,
  progress,
}: {
  caption: Caption;
  /** True while this caption's speak is playing. */
  speaking: boolean;
  /** 0..1 share of the line already spoken. Read once per frame while speaking. */
  progress: (action_id: string) => number;
}) {
  const words = useMemo(() => caption.text.split(/\s+/).filter(Boolean), [caption.text]);
  const [said, setSaid] = useState(words.length);

  // One rAF loop while speaking; re-renders only when the spoken word count changes.
  useEffect(() => {
    if (!speaking) {
      setSaid(words.length);
      return;
    }
    let frame = 0;
    const tick = () => {
      setSaid(Math.min(words.length, Math.ceil(progress(caption.action_id) * words.length)));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [speaking, words, progress, caption.action_id]);

  const sources = caption.sources ?? [];
  return (
    <div className="pointer-events-auto w-full max-w-3xl rounded-(--radius-xl) bg-(--card) px-6 py-4 text-center shadow-(--shadow-float)">
      {/* The full line for screen readers; the word-by-word spans are visual only. */}
      <p className="sr-only" aria-live="polite">
        {caption.text}
      </p>
      <p aria-hidden="true" className="text-[22px] leading-snug font-bold text-balance text-(--ink)">
        {words.map((word, i) => (
          <span
            key={i}
            className={
              i === said - 1 && speaking
                ? "rounded-(--radius-sm) bg-(--mento-blue-soft) text-(--mento-blue-strong)"
                : i < said
                  ? undefined
                  : "text-(--ink-soft) opacity-60"
            }
          >
            {word}{" "}
          </span>
        ))}
      </p>
      {(sources.length > 0 || caption.outside_material) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {sources.map((s, i) => (
            <Chip key={`${s.material_id}-${s.page}-${i}`} variant="source" title={`“${s.quote}”`}>
              {sourceLabel(s)}
            </Chip>
          ))}
          {caption.outside_material && <Chip variant="outside">Fora do material didático</Chip>}
        </div>
      )}
    </div>
  );
}
