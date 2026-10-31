import { mintSttToken } from "@mento/voice/server";
import type { Config } from "./config";
import { MongoService } from "./services/mongo.service";

/**
 * Composition root wiring (docs/21 §4 rule 3): builds the services that routes and controllers use.
 * Tests pass `overrides` to replace members with fakes.
 */
export interface Container {
  config: Config;
  mongo: MongoService;
  mintSttToken: typeof mintSttToken;
}

export function createContainer(config: Config, overrides: Partial<Container> = {}): Container {
  return {
    config,
    mongo: new MongoService(config.MONGODB_URI),
    mintSttToken,
    ...overrides,
  };
}
