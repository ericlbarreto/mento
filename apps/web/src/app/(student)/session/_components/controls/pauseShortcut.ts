// Owner: Person 2. Space pauses / continues the tutor, unless the student is typing or Space already belongs to
// the focused control (a button or link activates itself on Space; the chat textarea types a space).

/** What the guard reads from a keydown (a KeyboardEvent fits). */
export interface ShortcutKey {
  key: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  target: EventTarget | null;
}

const OWNS_SPACE = "input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='textbox'], [role='checkbox'], [role='switch'], [role='menuitem'], [role='option']";

export function isPauseShortcut(e: ShortcutKey): boolean {
  if (e.key !== " " || e.repeat || e.defaultPrevented) return false;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const target = e.target;
  if (typeof Element !== "undefined" && target instanceof Element) {
    if (target.closest(OWNS_SPACE)) return false;
    if (target instanceof HTMLElement && target.isContentEditable) return false;
  }
  return true;
}
