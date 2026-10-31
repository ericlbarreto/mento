import type { Citation, Chunk, Retriever, TurnRequest } from "@mento/contracts";

const ACKNOWLEDGEMENT = /^(ok|okay|sim|não|nao|certo|entendi|entendido|tá|ta|beleza|aham|uhum)[.!? ]*$/i;

/** Text to search the materials with before the LLM call, or null when no search is worth doing. */
export function retrievalQuery(appended: TurnRequest["appended"], lastTopic: string): string | null {
  let text: string | undefined;
  let selected: string | undefined;
  for (const a of appended) {
    if (a.name === "user_message") {
      text = a.text;
      selected = a.selected?.text;
    } else if (!text) {
      text = a.answer;
    }
  }
  if (!text || ACKNOWLEDGEMENT.test(text.trim())) return null;
  return [selected, text, lastTopic].filter(Boolean).join(" ").slice(0, 500);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

/** Keep citations whose quote occurs in a passage given this turn, or that the retriever confirms. */
export async function filterSources(
  sources: Citation[],
  passages: Chunk[],
  retriever: Retriever,
): Promise<{ kept: Citation[]; dropped: number }> {
  const kept: Citation[] = [];
  for (const c of sources) {
    const quote = norm(c.quote);
    const inPassages = passages.some((p) => p.material_id === c.material_id && p.page === c.page && norm(p.text).includes(quote));
    if (inPassages || (await retriever.validateCitation(c))) kept.push(c);
  }
  return { kept, dropped: sources.length - kept.length };
}
