import { chooseDatabase, connectMongo, disconnectMongo, mongoState, pingMongo, type MongoState } from "@mento/db";

/** Owns the MongoDB connection lifecycle for the API process. Other services receive the models from @mento/db. */
export class MongoService {
  constructor(
    private readonly uri: string,
    private readonly dbName?: string,
  ) {}

  async connect(): Promise<void> {
    const dbName = chooseDatabase(this.uri, this.dbName);
    await connectMongo(this.uri, dbName ? { dbName } : {});
  }

  async disconnect(): Promise<void> {
    await disconnectMongo();
  }

  state(): MongoState {
    return mongoState();
  }

  ping(): Promise<boolean> {
    return pingMongo();
  }
}
