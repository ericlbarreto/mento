import { buildApp } from "./app";
import { ensureChunkIndexes } from "@mento/db";
import { loadConfig } from "./config";

const config = loadConfig();
const app = await buildApp(config);

// A missing database must not block work that does not need it (e.g. the whiteboard UI): warn and keep going.
try {
  await app.container.mongo.connect();
  app.log.info("MongoDB connected");
  // The vector and text indexes behind the tutor's search (idempotent; Atlas builds them in the background).
  ensureChunkIndexes()
    .then((created) => created.length && app.log.info({ created }, "created Atlas search indexes (they become queryable after a few minutes)"))
    .catch((err) => app.log.warn({ err }, "could not ensure the Atlas search indexes (needs MongoDB Atlas); retrieval will find nothing until they exist"));
  const recovered = await app.container.ingest.recover();
  if (recovered > 0) app.log.info({ recovered }, "re-queued interrupted material ingestions");
} catch (err) {
  app.log.warn({ err }, "MongoDB not reachable: start mongod or set MONGODB_URI. Continuing without database.");
}

await app.listen({ port: config.API_PORT, host: config.API_HOST });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await app.container.mongo.disconnect();
    process.exit(0);
  });
}
