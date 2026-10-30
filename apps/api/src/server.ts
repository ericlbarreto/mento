import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = await buildApp(config);

// A missing database must not block work that does not need it (e.g. the whiteboard UI): warn and keep going.
try {
  await app.container.mongo.connect();
  app.log.info("MongoDB connected");
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
