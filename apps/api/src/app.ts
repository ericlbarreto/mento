import Fastify from "fastify";
import autoload from "@fastify/autoload";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import path from "node:path";
import type { Config } from "./config";
import { createContainer, type Container } from "./container";

export async function buildApp(config: Config, overrides: Partial<Container> = {}) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    forceCloseConnections: true, // abort open SSE streams on shutdown
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: config.WEB_ORIGIN, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } }); // PDF uploads (books)
  await app.register(websocket);
  await app.register(swagger, {
    openapi: { info: { title: "Mento API", version: "0.0.0" } },
    transform: jsonSchemaTransform,
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({ error: "validation_error", issues: error.validation });
    }
    // Checked by name: route files and @mento/db can be loaded by different module loaders in tests.
    if ((error as Error).name === "DatabaseUnavailableError") {
      return reply.status(503).send({ error: "database_unavailable", message: (error as Error).message });
    }
    request.log.error(error);
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: status >= 500 ? "internal_error" : "request_error", message: (error as Error).message });
  });

  app.decorate("container", createContainer(config, overrides));
  app.get("/api/openapi.json", async () => app.swagger());

  // Every file in routes/ is registered under /api (adding a route never touches a shared file).
  await app.register(autoload, {
    dir: path.join(import.meta.dirname, "routes"),
    options: { prefix: "/api" },
    ignorePattern: /.*\.(test|spec)\.ts$/,
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    container: Container;
  }
}
