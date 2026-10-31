// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useEndSession, type EndSessionFn } from "./useEndSession";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/session/s1");
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(end: EndSessionFn) {
  function Probe() {
    useEndSession({ sessionId: "s1", end, onEnded: () => undefined });
    return (
      <>
        <a href="/">Voltar ao início</a>
        <a href={window.location.pathname}>Mesma página</a>
        <a href="/" target="_blank">Nova aba</a>
      </>
    );
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Probe />));
  return (text: string) => {
    const link = [...host!.querySelectorAll("a")].find((a) => a.textContent === text)!;
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom does not navigate
    act(() => link.click());
  };
}

describe("useEndSession", () => {
  it("an in-app link that leaves the page ends the lesson once (user_left, keepalive); pagehide then sends nothing", () => {
    const end = vi.fn<EndSessionFn>(async () => undefined);
    const click = mount(end);
    click("Voltar ao início");
    click("Voltar ao início");
    window.dispatchEvent(new Event("pagehide"));
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith("s1", "user_left", { keepalive: true });
  });

  it("links to the same page or to a new tab do not end the lesson", () => {
    const end = vi.fn<EndSessionFn>(async () => undefined);
    const click = mount(end);
    click("Mesma página");
    click("Nova aba");
    expect(end).not.toHaveBeenCalled();
  });

  it("closing the tab ends the lesson (beacon)", () => {
    const end = vi.fn<EndSessionFn>(async () => undefined);
    mount(end);
    window.dispatchEvent(new Event("pagehide"));
    expect(end).toHaveBeenCalledWith("s1", "beacon", { keepalive: true });
  });
});
