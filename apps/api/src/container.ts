import type { Config } from "./config";

/**
 * Composition root wiring (docs/21 §4 rule 3). Build the repository, tutor, sources, analysis, voice,
 * and the scale-ready seams (EventBus, JobQueue, FileStore: in-memory implementations for now).
 * TODO (K5/K1 follow-up, shared): add the in-memory implementations, then each person wires their part.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Container {
  // repository: Repository;      // Person 1 (packages/db)
  // tutor: Tutor;                // Person 3 (packages/tutor)
  // sources: Sources;            // Person 1 (packages/sources)
  // analysis: Analysis;          // Person 1 (packages/analysis)
  // voice: Voice;                // Person 3 (packages/voice/server)
  // bus: EventBus; jobs: JobQueue; files: FileStore;   // packages/contracts interfaces
}

export function createContainer(_config: Config): Container {
  return {};
}
