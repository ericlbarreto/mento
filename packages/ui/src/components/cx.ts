// Joins class names, skipping falsy values.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Shared interaction classes: keyboard focus ring (token), press feedback and motion tokens.
export const focusRing = "outline-none focus-visible:shadow-(--focus-ring)";
export const transition =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-(--dur-fast) ease-(--ease-out)";
