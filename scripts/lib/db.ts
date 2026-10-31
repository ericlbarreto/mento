import mongoose from "mongoose";
import { chooseDatabase, connectMongo, disconnectMongo, MongoRepository } from "@mento/db";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // no .env: the environment must provide MONGODB_URI
}

export interface Args {
  flags: Set<string>;
  values: Map<string, string>;
}

/** `--reset --db mento_e2e` → flags {reset}, values {db: mento_e2e}. */
export function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.set(a.slice(2), next);
      i += 1;
    } else flags.add(a.slice(2));
  }
  return { flags, values };
}

/** Connects to MONGODB_URI. Database: `--db`, else MONGODB_DB, else the one named in the URI, else `mento` (never the Atlas default `test`). */
export async function openRepo(args: Args) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");
  const chosen = chooseDatabase(uri, args.values.get("db") ?? process.env.MONGODB_DB);
  await connectMongo(uri, chosen ? { dbName: chosen } : {});
  const repo = new MongoRepository();
  await repo.syncIndexes();
  return { repo, dbName: mongoose.connection.name, close: disconnectMongo };
}
