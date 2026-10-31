/** Turns texts into vectors. `document` for stored passages, `query` for search questions. */
export type Embed = (texts: string[], input_type: "document" | "query") => Promise<number[][]>;

export interface VoyageOptions {
  apiKey: string;
  /** Default `voyage-4` (1024 dimensions, multilingual). */
  model?: string;
  baseUrl?: string;
  /** The API accepts up to 128 inputs per request. */
  batchSize?: number;
  /** Retries on 429 and 5xx (Retry-After is honored, otherwise 1 s, 2 s, 4 s…). Default 3. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function embedWithVoyage(opts: VoyageOptions): Embed {
  const {
    apiKey,
    model = "voyage-4",
    baseUrl = "https://api.voyageai.com",
    batchSize = 128,
    maxRetries = 3,
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = opts;

  const post = async (input: string[], input_type: string): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input, model, input_type }),
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (res.ok || !retryable || attempt >= maxRetries) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    }
  };

  return async (texts, input_type) => {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const res = await post(texts.slice(i, i + batchSize), input_type);
      if (!res.ok) throw new Error(`Voyage embeddings failed: HTTP ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      vectors.push(...[...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return vectors;
  };
}
