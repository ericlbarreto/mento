// Owner: Person 1. The small "PDF" tile in front of each material, colored by subject.
import { IconBook, IconFile } from "./icons";
import { cx } from "./ui";

const SUBJECT_TONE: Record<string, string> = {
  História: "bg-[var(--blue-tint)] text-[var(--mento-blue)]",
  Geografia: "bg-[var(--ok-soft)] text-[var(--ok)]",
  Ciências: "bg-[var(--warn-soft)] text-[var(--warn)]",
  Português: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

export function MaterialTile({ subject, size = "md" }: { subject: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cx(
        "flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--line)]",
        SUBJECT_TONE[subject] ?? "bg-[var(--paper-2)] text-[var(--ink)]",
        size === "lg" ? "h-20 w-16" : "h-16 w-14",
      )}
      aria-hidden="true"
    >
      <span className="text-[10px] font-extrabold tracking-[0.08em]">PDF</span>
      {subject === "História" ? <IconBook size={size === "lg" ? 24 : 20} /> : <IconFile size={size === "lg" ? 24 : 20} />}
    </span>
  );
}
