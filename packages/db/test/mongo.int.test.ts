import { afterAll, beforeAll, describe } from "vitest";
import mongoose from "mongoose";
import { MongoRepository, connectMongo, disconnectMongo } from "../src";
import { TEST_DB, mongoTestUri } from "./mongo-env";
import { repositorySuite } from "./repository.suite";

const uri = mongoTestUri();

describe.skipIf(!uri)("MongoDB integration (database mento_test_db)", () => {
  const repo = new MongoRepository();
  beforeAll(async () => {
    await connectMongo(uri!, { dbName: TEST_DB });
    await mongoose.connection.dropDatabase();
    await repo.syncIndexes();
  }, 60_000);
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  }, 30_000);

  // The throwaway database: wipe real materials too (resetTeacherData keeps them on purpose).
  repositorySuite("mongo", () => repo, async () => {
    await repo.resetTeacherData();
    await mongoose.connection.db!.collection("materials").deleteMany({});
  });
});
