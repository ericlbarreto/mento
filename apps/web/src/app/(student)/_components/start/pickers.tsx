"use client";

// Owner: Person 2. Student and material cards for the start screen, plus their loading skeleton.
import type { CSSProperties } from "react";
import type { MaterialSummary, StudentSummary } from "@mento/board";
import { Badge, Card, cx } from "@mento/ui";
import styles from "./start.module.css";

/** Stagger index for the fade-up entrance (start.module.css). */
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

/** "Ana S." → "AS"; "Bruno" → "B". */
export function initials(name: string): string {
  const words = name.replace(/\./g, "").trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function StudentGrid({ students, onPick }: { students: StudentSummary[]; onPick: (s: StudentSummary) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" aria-label="Alunos">
      {students.map((s, i) => (
        <li key={s.id} className={styles.fadeUp} style={stagger(i)}>
          <Card interactive onClick={() => onPick(s)} className="flex items-center gap-4 p-4">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-(--mento-blue-soft) text-base font-extrabold text-(--mento-blue-strong)"
            >
              {initials(s.name)}
            </span>
            <span className="min-w-0 truncate text-lg font-bold">{s.name}</span>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-6">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7.5h8M8 11h5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export function MaterialGrid({
  materials,
  selectedId,
  onPick,
}: {
  materials: MaterialSummary[];
  selectedId: string | null;
  onPick: (m: MaterialSummary) => void;
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2" aria-label="Materiais">
      {materials.map((m, i) => {
        const selected = m.id === selectedId;
        return (
          <li key={m.id} className={styles.fadeUp} style={stagger(i + 1)}>
            <Card interactive selected={selected} onClick={() => onPick(m)} className="flex h-full items-start gap-4">
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-11 shrink-0 items-center justify-center rounded-(--radius-md) transition-colors duration-(--dur-fast)",
                  selected ? "bg-(--mento-blue) text-white" : "bg-(--paper-2) text-(--mento-blue-strong)",
                )}
              >
                {selected ? <CheckIcon /> : <BookIcon />}
              </span>
              <span className="flex min-w-0 flex-col gap-2">
                <span className="text-lg leading-snug font-bold text-balance">{m.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-(--ink-soft)">
                  <Badge tone="info">{m.subject}</Badge>
                  <span className="tabular-nums">{m.pages === 1 ? "1 página" : `${m.pages} páginas`}</span>
                </span>
              </span>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** Placeholder cards with the same footprint as the real ones (no layout shift). */
export function SkeletonGrid({ count, tall = false }: { count: number; tall?: boolean }) {
  return (
    <ul className={cx("grid gap-4", tall ? "md:grid-cols-2" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4")} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className={cx("rounded-(--radius-lg) border border-(--line) bg-(--paper-2)", tall ? "h-28" : "h-20", styles.skeleton)}
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </ul>
  );
}
