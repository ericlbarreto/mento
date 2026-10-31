export interface GeneratedImage {
  bytes: Buffer;
  mime_type: string;
}

export interface ImageClient {
  generate(req: { prompt: string; signal?: AbortSignal }): Promise<GeneratedImage>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Find the first base64 image in a Google response, whatever the exact field names are. */
export function extractImage(json: unknown): GeneratedImage | null {
  if (!isObject(json)) return null;
  const direct = json.output_image;
  if (isObject(direct) && typeof direct.data === "string") {
    return { bytes: Buffer.from(direct.data, "base64"), mime_type: String(direct.mime_type ?? direct.mimeType ?? "image/jpeg") };
  }
  const walk = (node: unknown): GeneratedImage | null => {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    if (!isObject(node)) return null;
    const mime = node.mime_type ?? node.mimeType;
    if (typeof node.data === "string" && typeof mime === "string" && mime.startsWith("image/")) {
      return { bytes: Buffer.from(node.data, "base64"), mime_type: mime };
    }
    for (const value of Object.values(node)) {
      const found = walk(value);
      if (found) return found;
    }
    return null;
  };
  return walk(json);
}

/** Describes the JSON structure (keys only, no values) for error messages. */
function shapeOf(node: unknown, depth = 0): string {
  if (Array.isArray(node)) return `[${node.length ? shapeOf(node[0], depth + 1) : ""}]`;
  if (!isObject(node)) return typeof node;
  if (depth > 3) return "{…}";
  return `{${Object.entries(node).map(([k, v]) => `${k}: ${shapeOf(v, depth + 1)}`).join(", ")}}`;
}

export interface GeminiImageOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  aspectRatio?: string;
  fetchImpl?: typeof fetch;
}

export class GeminiImageClient implements ImageClient {
  constructor(private readonly opts: GeminiImageOptions) {}

  async generate(req: { prompt: string; signal?: AbortSignal }): Promise<GeneratedImage> {
    const { apiKey, model, baseUrl = "https://generativelanguage.googleapis.com", aspectRatio = "4:3", fetchImpl = fetch } = this.opts;
    const res = await fetchImpl(`${baseUrl}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: req.prompt,
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspectRatio, image_size: "1K" },
      }),
      signal: req.signal,
    });
    const text = await res.text();
    const redact = (s: string) => s.split(apiKey).join("***");
    if (!res.ok) throw new Error(`Gemini image failed: HTTP ${res.status} ${redact(text).slice(0, 300)}`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Gemini image failed: response is not JSON: ${redact(text).slice(0, 120)}`);
    }
    const image = extractImage(json);
    if (!image) throw new Error(`Gemini image failed: no image in the response (shape: ${redact(shapeOf(json))})`);
    return image;
  }
}
