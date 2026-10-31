import mongoose from "mongoose";

export type MongoState = "disconnected" | "connected" | "connecting" | "disconnecting";

const STATES: Record<number, MongoState> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export interface ConnectOptions {
  /** Database name. The Atlas URI has none, so without this MongoDB falls back to `test`. */
  dbName?: string;
}

/** The database named in a MongoDB URI (`mongodb://host/mento?x=1` → `mento`), or `undefined` when it has none. */
export function databaseNameOf(uri: string): string | undefined {
  try {
    const name = decodeURIComponent(new URL(uri).pathname.replace(/^\//, ""));
    return name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which database to use: an explicit name, else the one in the URI, else `fallback` (never the driver default `test`).
 * Returns `undefined` when the URI already names one, so the whiteboard code keeps connecting exactly as before.
 */
export function chooseDatabase(uri: string, explicit?: string, fallback = "mento"): string | undefined {
  return explicit ?? (databaseNameOf(uri) ? undefined : fallback);
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
