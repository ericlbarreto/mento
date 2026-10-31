/** Turns texts into vectors. `document` for stored passages, `query` for search questions. */
export type Embed = (texts: string[], input_type: "document" | "query") => Promise<number[][]>;

export interface VoyageOptions {
  apiKey: string;
  /** Default `voyage-4` (1024 dimensions, multilingual). */
  model?: string;
  baseUrl?: string;
  /** The API accepts up to 128 inputs per request. */
  batchSize?: number;
  fetchImpl?: typeof fetch;
}

export function embedWithVoyage(opts: VoyageOptions): Embed {
  const { apiKey, model = "voyage-4", baseUrl = "https://api.voyageai.com", batchSize = 128, fetchImpl = fetch } = opts;
  return async (texts, input_type) => {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const res = await fetchImpl(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts.slice(i, i + batchSize), model, input_type }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings failed: HTTP ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      vectors.push(...[...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return vectors;
  };
}
