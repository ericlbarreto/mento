/** Shared concept key (contracts-spec §7): lowercase → NFD → strip diacritics → non-alnum to space → collapse → trim. */
export function normalizeConcept(concept: string): string {
  return concept
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
