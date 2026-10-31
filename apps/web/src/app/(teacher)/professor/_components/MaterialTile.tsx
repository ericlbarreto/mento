// Owner: Person 1. The small "PDF" tile in front of each material.
import { IconBook } from "./icons";
import { cx } from "./ui";

export function MaterialTile({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={cx(
        "flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--blue-tint)] text-[var(--mento-blue)]",
        size === "lg" ? "h-20 w-16" : "h-16 w-14",
      )}
      aria-hidden="true"
    >
      <span className="text-[11px] font-extrabold tracking-[0.08em]">PDF</span>
      <IconBook size={size === "lg" ? 24 : 20} />
    </span>
  );
}
