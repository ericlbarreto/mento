export type BargeInDecision = "wait" | "echo" | "interrupt";

export interface BargeInResult {
  decision: BargeInDecision;
  overlap: number;
  words: number;
}

const wordsOf = (text: string): string[] =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];

function containment(candidate: string[], reference: string[]): number {
  if (candidate.length === 0) return 0;
  const available = new Map<string, number>();
  for (const word of reference) available.set(word, (available.get(word) ?? 0) + 1);
  let matches = 0;
  for (const word of candidate) {
    const count = available.get(word) ?? 0;
    if (count === 0) continue;
    matches += 1;
    available.set(word, count - 1);
  }
  return matches / candidate.length;
}

/**
 * Cheap text-level guard for speaker bleed during tutor playback.
 * Nova-3 interims need two words before barge-in; a final result can confirm one word.
 */
export function classifyBargeIn(input: {
  transcript: string;
  kind: "interim" | "final";
  tutorText: string;
  echoThreshold?: number;
}): BargeInResult {
  const candidate = wordsOf(input.transcript);
  const overlap = containment(candidate, wordsOf(input.tutorText));
  if (candidate.length === 0 || (input.kind === "interim" && candidate.length < 2)) {
    return { decision: "wait", overlap, words: candidate.length };
  }
  return {
    decision: overlap >= (input.echoThreshold ?? 0.8) ? "echo" : "interrupt",
    overlap,
    words: candidate.length,
  };
}
