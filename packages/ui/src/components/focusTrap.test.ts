import { describe, expect, it } from "vitest";
import { menuIndex, trapTarget } from "./focusTrap";

describe("trapTarget", () => {
  it("wraps Tab from the last to the first focusable", () => {
    expect(trapTarget(2, 3, false)).toBe(0);
  });
  it("wraps Shift+Tab from the first to the last focusable", () => {
    expect(trapTarget(0, 3, true)).toBe(2);
  });
  it("leaves Tab to the browser in the middle of the trap", () => {
    expect(trapTarget(1, 3, false)).toBeNull();
    expect(trapTarget(1, 3, true)).toBeNull();
  });
  it("pulls focus back in when it is outside the trap", () => {
    expect(trapTarget(-1, 3, false)).toBe(0);
    expect(trapTarget(-1, 3, true)).toBe(2);
  });
  it("does nothing with no focusables", () => {
    expect(trapTarget(-1, 0, false)).toBeNull();
  });
});

describe("menuIndex", () => {
  it("moves down and up with wrap-around", () => {
    expect(menuIndex(0, "ArrowDown", 5)).toBe(1);
    expect(menuIndex(4, "ArrowDown", 5)).toBe(0);
    expect(menuIndex(0, "ArrowUp", 5)).toBe(4);
  });
  it("jumps with Home and End", () => {
    expect(menuIndex(2, "Home", 5)).toBe(0);
    expect(menuIndex(2, "End", 5)).toBe(4);
  });
  it("starts from the edges when nothing is focused", () => {
    expect(menuIndex(-1, "ArrowDown", 5)).toBe(0);
    expect(menuIndex(-1, "ArrowUp", 5)).toBe(4);
  });
  it("ignores other keys and empty menus", () => {
    expect(menuIndex(1, "a", 5)).toBeNull();
    expect(menuIndex(0, "ArrowDown", 0)).toBeNull();
  });
});
