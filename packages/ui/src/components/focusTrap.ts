// Pure helpers behind the Modal/Drawer focus trap and the Menu's arrow keys (unit-tested in focusTrap.test.ts).

/** Elements that can take keyboard focus inside a dialog. */
export const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Where Tab should land inside a trap of `count` focusables. `current` is the index of the focused element
 * (-1 when focus is outside the trap). Returns null when the browser's own Tab can be left alone.
 */
export function trapTarget(current: number, count: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (current === -1) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

/** Roving index for a vertical menu: arrows wrap, Home/End jump. Returns null for keys the menu ignores. */
export function menuIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
