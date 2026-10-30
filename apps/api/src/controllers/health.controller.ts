import type { FastifyReply, FastifyRequest } from "fastify";
import type { HealthResponse } from "@mento/contracts";

/**
 * Controller pattern: a plain async function (request, reply) that reads input, calls services from
 * `request.server.container`, and returns data. No business logic here and no direct model access.
 */
export async function getHealth(request: FastifyRequest, _reply: FastifyReply): Promise<HealthResponse> {
  const { mongo } = request.server.container;
  return {
    ok: await mongo.ping(),
    service: "mento-api",
    time: new Date().toISOString(),
    mongo: mongo.state(),
  };
}
