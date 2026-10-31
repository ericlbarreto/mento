import type { Citation, OutlineItem, TeacherRepository } from "@mento/contracts";
import { normalizeSearchText } from "./text";

/** A citation is valid when its `quote` occurs on that page of that material (accents, case and spacing ignored). */
export async function validateCitation(repo: TeacherRepository, citation: Citation): Promise<boolean> {
  const quote = normalizeSearchText(citation.quote);
  if (!quote) return false;
  const chunks = await repo.getPages(citation.material_id, [citation.page]);
  return normalizeSearchText(chunks.map((c) => c.text).join(" ")).includes(quote);
}

export async function getOutline(repo: TeacherRepository, materialId: string): Promise<OutlineItem[]> {
  return (await repo.getMaterial(materialId))?.outline ?? [];
}
