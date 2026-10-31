import type { Material, TeacherRepository } from "@mento/contracts";
import { MemoryFileStore, makeTestPdf } from "../src/upload";

export const PAGES = [
  "Capítulo 1 — Fundação de Roma\nSegundo a lenda, Roma foi fundada em 753 a.C. por Rômulo e Remo.\nA cidade foi governada por sete reis durante a Monarquia.",
  "Capítulo 2 — A República\nO fim da República aconteceu quando Otávio recebeu o título de Augusto.\nO Senado perdeu poder e os cônsules foram esvaziados.",
  "O Coliseu foi inaugurado em 80 d.C., já no Império, para espetáculos públicos de grande porte.\nO pão e circo distraía a população urbana.",
  "", // a scanned page: no text layer
];

export const book = () => makeTestPdf(PAGES);

/** Stores a PDF and creates the `queued` material the upload route would create. */
export async function queuedMaterial(repo: TeacherRepository, store: MemoryFileStore, data: Buffer, title = "Livro"): Promise<Material> {
  const key = `${title}.pdf`;
  await store.put(key, data);
  return repo.upsertMaterial({ title, subject: "História", status: "queued", file: { key, size: data.length, sha256: title, mime: "application/pdf" } });
}
