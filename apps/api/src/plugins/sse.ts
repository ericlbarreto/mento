import type { FastifyReply, FastifyRequest } from "fastify";
import { StreamMessage } from "@mento/contracts";

export interface Sse {
  /** Send one SSE message: `event: <name>` + JSON `data`. */
  send(event: string, data: unknown): void;
  /** Aborted when the client disconnects: pass it to LLM/TTS/image calls (docs/21 §5). */
  signal: AbortSignal;
  close(): void;
}

/**
 * Open a Server-Sent Events response with the headers that keep proxies from buffering,
 * a keep-alive comment every ~15 s, and an AbortSignal tied to the client connection.
 */
export function openSse(request: FastifyRequest, reply: FastifyReply, keepAliveMs = 15_000): Sse {
  const controller = new AbortController();
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    ...reply.getHeaders(), // keeps CORS headers added by @fastify/cors
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  } as Record<string, string>);
  raw.write(": connected\n\n");

  const ping = setInterval(() => raw.write(": ping\n\n"), keepAliveMs);
  const cleanup = () => {
    clearInterval(ping);
    controller.abort();
  };
  request.raw.on("close", cleanup);

  return {
    signal: controller.signal,
    send(event, data) {
      if (raw.writableEnded) return;
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(ping);
      if (!raw.writableEnded) raw.end();
    },
  };
}

/**
 * Send one validated turn-stream message: `event: <type>` and `data: <message JSON>`.
 * Throws if the message breaks the contract, so a bad message never reaches the front-end.
 */
export function sendStreamMessage(sse: Sse, message: StreamMessage): void {
  const valid = StreamMessage.parse(message);
  sse.send(valid.type, valid);
}
