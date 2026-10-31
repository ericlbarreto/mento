import type { CatalogRecord } from "@mento/contracts";
import type { TurnRepository } from "@mento/tutor";

/**
 * Takes the catalog of materials from MongoDB when it is reachable (otherwise from the base repository).
 * Person 1's MongoDB repository replaces this wrapper when it implements `getCatalog` itself.
 */
export function withCatalog(
  repo: TurnRepository,
  listCatalog: (subject_id?: string) => Promise<CatalogRecord[]>,
  isAvailable: () => boolean,
): TurnRepository {
  return {
    createSession: (input) => repo.createSession(input),
    getSession: (id) => repo.getSession(id),
    appendEvent: (id, event) => repo.appendEvent(id, event),
    listEvents: (id) => repo.listEvents(id),
    endSession: (id, reason) => repo.endSession(id, reason),
    getClassContext: () => repo.getClassContext(),
    getLearnerSummary: (student_id) => repo.getLearnerSummary(student_id),
    async getCatalog(subject_id?: string) {
      if (isAvailable()) {
        try {
          const catalog = await listCatalog(subject_id);
          // A subject with no ready material has an empty catalog; only the free whiteboard falls back to the demo entry.
          if (subject_id || catalog.length > 0) return catalog;
        } catch {
          /* use the base repository */
        }
      }
      return repo.getCatalog(subject_id);
    },
  };
}
