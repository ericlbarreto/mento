import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";

/**
 * Composition root wiring (docs/21 §4 rule 3): builds the services that routes and controllers use.
 * Add yours here (e.g. `students: new StudentService()`); scale-ready seams (EventBus, JobQueue, FileStore)
 * from @mento/contracts are added in the same place, in-memory for now.
 */
export interface Container {
  mongo: MongoService;
}

export function createContainer(config: Config): Container {
  return {
    mongo: new MongoService(config.MONGODB_URI),
  };
}
