import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { ClassContext } from "@mento/contracts";
import { getClassContextData, putClassContext } from "../controllers/teacher.controller";

// Owner: Person 1. One global class context (grade level + description) applied to every student chat.
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/class-context", { schema: { response: { 200: ClassContext } } }, async () => getClassContextData(app.container));
  app.put("/class-context", { schema: { body: ClassContext, response: { 200: ClassContext } } }, async (request) =>
    putClassContext(app.container, request.body),
  );
};

export default plugin;
