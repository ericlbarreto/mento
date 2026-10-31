"use client";

// Owner: Person 2. Student picker ("Trocar aluno" on the home screen) and the shared loading skeleton.
import type { CSSProperties } from "react";
import type { StudentSummary } from "@mento/board";
import { Avatar, Card, cx } from "@mento/ui";
import styles from "./start.module.css";

/** Stagger index for the fade-up entrance (start.module.css). */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

export function StudentGrid({
  students,
  selectedId,
  onPick,
}: {
  students: StudentSummary[];
  selectedId?: string | null;
  onPick: (s: StudentSummary) => void;
}) {
  return (
    <ul className="grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2" aria-label="Alunos">
      {students.map((s, i) => (
        <li key={s.id} className={styles.fadeUp} style={stagger(i)}>
          <Card interactive selected={s.id === selectedId} onClick={() => onPick(s)} className="flex items-center gap-3 p-3">
            <Avatar name={s.name} size="lg" decorative />
            <span className="min-w-0 truncate text-lg font-bold">{s.name}</span>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Placeholder blocks with the footprint of the real cards (no layout shift). `className` sets the size. */
export function Skeleton({ className, index = 0 }: { className?: string; index?: number }) {
  return (
    <div
      aria-hidden="true"
      className={cx("rounded-(--radius-lg) border border-(--line) bg-(--paper-2)", styles.skeleton, className)}
      style={{ animationDelay: `${index * 120}ms` }}
    />
  );
}
