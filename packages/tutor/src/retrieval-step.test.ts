import { describe, expect, it } from "vitest";
import type { Chunk, Retriever } from "@mento/contracts";
import { filterSources, retrievalQuery } from "./retrieval-step";

describe("retrievalQuery", () => {
  it("combines the selection, the message and the last topic", () => {
    expect(
      retrievalQuery([{ name: "user_message", kind: "board_select", text: "O que é isso?", selected: { element_id: "tl", text: "27 a.C." } }], "Da República ao Império"),
    ).toBe("27 a.C. O que é isso? Da República ao Império");
  });

  it("uses the answer text, and skips the opening turn and short acknowledgements", () => {
    expect(retrievalQuery([{ name: "verification_answer", verification_id: "v", element_id: "q", answer: "Mudou o governo" }], "")).toBe("Mudou o governo");
    expect(retrievalQuery([], "tema")).toBeNull();
    expect(retrievalQuery([{ name: "user_message", kind: "chat", text: "ok" }], "tema")).toBeNull();
    expect(retrievalQuery([{ name: "user_message", kind: "chat", text: "Entendi!" }], "tema")).toBeNull();
  });
});

describe("filterSources", () => {
  const passage: Chunk = { id: "c1", material_id: "m1", subject: "history", page: 12, passage_idx: 0, text: "Em 27 a.C., o Senado concedeu a Otávio o título de Augusto." };
  const retriever = (valid: boolean): Retriever => ({ searchChunks: async () => [], validateCitation: async () => valid });

  it("keeps a quote found in a retrieved passage without asking the database", async () => {
    let asked = 0;
    const r: Retriever = { searchChunks: async () => [], validateCitation: async () => (asked++, false) };
    const out = await filterSources([{ material_id: "m1", page: 12, quote: "o  Senado concedeu a OTÁVIO o título" }], [passage], r);
    expect(out.kept).toHaveLength(1);
    expect(out.dropped).toBe(0);
    expect(asked).toBe(0);
  });

  it("falls back to the retriever for quotes outside the retrieved passages, and drops fakes", async () => {
    const fake = { material_id: "m1", page: 99, quote: "texto inventado" };
    expect((await filterSources([fake], [passage], retriever(true))).kept).toHaveLength(1);
    const dropped = await filterSources([fake], [passage], retriever(false));
    expect(dropped.kept).toHaveLength(0);
    expect(dropped.dropped).toBe(1);
  });
});
