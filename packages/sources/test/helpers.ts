import type { Material, TeacherRepository } from "@mento/contracts";
import { MemoryChunkStore, MemoryRepository } from "@mento/db";
import { MemoryFileStore, fakeEmbed, makeTestPdf } from "../src";

export const PAGES = [
  "Capítulo 1 — Fundação de Roma\nSegundo a lenda, Roma foi fundada em 753 a.C. por Rômulo e Remo.\nA cidade foi governada por sete reis durante a Monarquia.",
  "Capítulo 2 — A República\nO fim da República aconteceu quando Otávio recebeu o título de Augusto.\nO Senado perdeu poder e os cônsules foram esvaziados.",
  "O Coliseu foi inaugurado em 80 d.C., já no Império, para espetáculos públicos de grande porte.\nO pão e circo distraía a população urbana.",
  "", // a scanned page: no text layer
];

export const book = () => makeTestPdf(PAGES);
export const embed = fakeEmbed(32);

/** The same world the API builds: materials in one repository, passages and catalog in the whiteboard's chunk store. */
export function world() {
  const repo = new MemoryRepository();
  const chunks = new MemoryChunkStore(repo);
  const files = new MemoryFileStore();
  return { repo, chunks, files, deps: { repo, chunks, files, embed } };
}

/** Stores a PDF and creates the `queued` material that the upload route creates. */
export async function queuedMaterial(
  repo: TeacherRepository,
  files: MemoryFileStore,
  data: Buffer,
  title = "Livro",
  subject = { key: "history", id: "sub-history" },
): Promise<Material> {
  const key = `${title}.pdf`;
  await files.put(key, data);
  return repo.upsertMaterial({
    title,
    subject: subject.key,
    subject_id: subject.id,
    status: "queued",
    file: { key, size: data.length, sha256: title, mime: "application/pdf" },
  });
}
