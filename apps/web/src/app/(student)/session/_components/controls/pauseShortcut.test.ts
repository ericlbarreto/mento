// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isPauseShortcut } from "./pauseShortcut";

const on = (html: string, selector = "*") => {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root.querySelector(selector) ?? root;
};

describe("Space pause shortcut", () => {
  it("fires on a bare Space over the board or the page", () => {
    expect(isPauseShortcut({ key: " ", target: document.body })).toBe(true);
    expect(isPauseShortcut({ key: " ", target: on(`<div data-element-id="t1" tabindex="0">Roma</div>`, "[data-element-id]") })).toBe(true);
    expect(isPauseShortcut({ key: " ", target: null })).toBe(true);
  });

  it("leaves Space to text fields and to controls that activate on it", () => {
    expect(isPauseShortcut({ key: " ", target: on(`<textarea></textarea>`, "textarea") })).toBe(false);
    expect(isPauseShortcut({ key: " ", target: on(`<input type="text" />`, "input") })).toBe(false);
    expect(isPauseShortcut({ key: " ", target: on(`<div contenteditable="true"><b>x</b></div>`, "b") })).toBe(false);
    expect(isPauseShortcut({ key: " ", target: on(`<button><svg></svg></button>`, "svg") })).toBe(false);
    expect(isPauseShortcut({ key: " ", target: on(`<a href="/">x</a>`, "a") })).toBe(false);
  });

  it("ignores other keys, repeats, modifiers and handled events", () => {
    expect(isPauseShortcut({ key: "Enter", target: document.body })).toBe(false);
    expect(isPauseShortcut({ key: " ", repeat: true, target: document.body })).toBe(false);
    expect(isPauseShortcut({ key: " ", shiftKey: true, target: document.body })).toBe(false);
    expect(isPauseShortcut({ key: " ", ctrlKey: true, target: document.body })).toBe(false);
    expect(isPauseShortcut({ key: " ", defaultPrevented: true, target: document.body })).toBe(false);
  });
});
