/** Lowercase, collapse whitespace: used to compare quotes with page text. */
export const normalizeText = (s: string): string => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
