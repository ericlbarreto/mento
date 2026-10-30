import { connectMongo, disconnectMongo, mongoState, pingMongo, type MongoState } from "@mento/db";

/** Owns the MongoDB connection lifecycle for the API process. Other services receive the models from @mento/db. */
export class MongoService {
  constructor(private readonly uri: string) {}

  async connect(): Promise<void> {
    await connectMongo(this.uri);
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
