import mongoose from "mongoose";

export type MongoState = "disconnected" | "connected" | "connecting" | "disconnecting";

const STATES: Record<number, MongoState> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export interface ConnectOptions {
  /** Database name. Optional: without it the driver uses the one named in the URI (`test` when an Atlas URI names none). */
  dbName?: string;
}

/** Connect once per process (Mongoose keeps a single shared connection). Throws if the server is unreachable. */
export async function connectMongo(uri: string, options: ConnectOptions = {}): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, ...(options.dbName ? { dbName: options.dbName } : {}) });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export function mongoState(): MongoState {
  return STATES[mongoose.connection.readyState] ?? "disconnected";
}

/** Round-trip to the server: true only when the database answers. */
export async function pingMongo(): Promise<boolean> {
  try {
    await mongoose.connection.db?.admin().ping();
    return mongoose.connection.db !== undefined;
  } catch {
    return false;
  }
}
