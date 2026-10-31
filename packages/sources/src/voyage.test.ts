import { describe, expect, it } from "vitest";
import { embedWithVoyage } from "./voyage";

function fakeFetch() {
  const calls: { url: string; init: RequestInit; body: { input: string[]; model: string; input_type: string } }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, init, body });
    // answer out of order on purpose: the client must sort by index
    const data = body.input.map((t: string, index: number) => ({ index, embedding: [t.length, index] })).reverse();
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("embedWithVoyage", () => {
  it("sends the model, input type and bearer key, and returns vectors in input order", async () => {
    const { impl, calls } = fakeFetch();
    const embed = embedWithVoyage({ apiKey: "v-key", fetchImpl: impl });
    expect(await embed(["aa", "bbbb"], "query")).toEqual([[2, 0], [4, 1]]);
    expect(calls[0]!.url).toBe("https://api.voyageai.com/v1/embeddings");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer v-key");
    expect(calls[0]!.body).toEqual({ input: ["aa", "bbbb"], model: "voyage-4", input_type: "query" });
  });

  it("splits large inputs into batches of 128 and keeps the global order", async () => {
    const { impl, calls } = fakeFetch();
    const texts = Array.from({ length: 300 }, (_, i) => "x".repeat(i + 1));
    const out = await embedWithVoyage({ apiKey: "k", fetchImpl: impl })(texts, "document");
    expect(calls.map((c) => c.body.input.length)).toEqual([128, 128, 44]);
    expect(out).toHaveLength(300);
    expect(out[0]![0]).toBe(1);
    expect(out[299]![0]).toBe(300);
  });

  it("makes no request for no input and fails on an HTTP error", async () => {
    const { impl, calls } = fakeFetch();
    expect(await embedWithVoyage({ apiKey: "k", fetchImpl: impl })([], "query")).toEqual([]);
    expect(calls).toHaveLength(0);
    const failing = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(embedWithVoyage({ apiKey: "k", fetchImpl: failing })(["a"], "query")).rejects.toThrow("401");
  });
});
