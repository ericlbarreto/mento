import { describe, expect, it } from "vitest";
import { AsyncQueue } from "./async-queue";

describe("AsyncQueue", () => {
  it("yields pushed items in order, including items pushed before and after iteration starts", async () => {
    const q = new AsyncQueue<number>();
    q.push(1);
    const seen: number[] = [];
    const reader = (async () => {
      for await (const n of q) seen.push(n);
    })();
    q.push(2);
    q.push(3);
    q.end();
    await reader;
    expect(seen).toEqual([1, 2, 3]);
  });

  it("rejects the iteration when failed", async () => {
    const q = new AsyncQueue<number>();
    q.push(1);
    q.fail(new Error("boom"));
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const n of q) seen.push(n);
      })(),
    ).rejects.toThrow("boom");
    expect(seen).toEqual([1]);
  });
});
