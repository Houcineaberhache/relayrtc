import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "./http/errors/api-error.js";

export interface RequestLimits {
  node: number;
  ip: number;
  key: number;
  project: number;
  room: number;
  entries: number;
}

export function readRequestLimits(
  source: Readonly<Record<string, string | undefined>>,
): RequestLimits {
  const read = (name: string, fallback: number) => {
    const value = Number(source[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
      throw new Error(`${name} must be an integer between 1 and 1000000`);
    return value;
  };
  return {
    node: read("API_REQUESTS_PER_NODE_PER_MINUTE", 10000),
    ip: read("API_REQUESTS_PER_IP_PER_MINUTE", 600),
    key: read("API_REQUESTS_PER_KEY_PER_MINUTE", 1200),
    project: read("API_REQUESTS_PER_PROJECT_PER_MINUTE", 3000),
    room: read("API_REQUESTS_PER_ROOM_PER_MINUTE", 1200),
    entries: read("API_LIMIT_TRACKED_SCOPES", 10000),
  };
}

export function registerRequestLimits(app: FastifyInstance, limits: RequestLimits) {
  const buckets = new Map<string, { count: number; expires: number }>();
  let prunedAt = 0;
  const check = (key: string, maximum: number) => {
    const now = Date.now();
    if (now - prunedAt >= 1000) {
      for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
      prunedAt = now;
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      if (!bucket && buckets.size >= limits.entries) return 60;
      bucket = { count: 0, expires: now + 60000 };
      buckets.set(key, bucket);
    }
    if (bucket.count >= maximum) return Math.max(1, Math.ceil((bucket.expires - now) / 1000));
    bucket.count++;
    return 0;
  };
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?", 1)[0] ?? "";
    if (path !== "/v1" && !path.startsWith("/v1/")) return;
    const retry =
      check("node", limits.node) ||
      check(`ip:${createHash("sha256").update(request.ip).digest("hex")}`, limits.ip);
    if (retry) {
      reply.header("retry-after", retry);
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "The API instance or client IP request limit was reached; retry after the indicated delay",
      );
    }
  });
  app.addHook("preHandler", async (request, reply) => {
    if (!request.apiKey) return;
    const principal = request.apiKey;
    const params = request.params as { roomId?: string };
    const scopes: [string, number][] = [
      [`key:${principal.keyId}`, limits.key],
      [`project:${principal.projectId}`, limits.project],
    ];
    if (params.roomId)
      scopes.push([
        `room:${principal.projectId}:${principal.environmentId}:${params.roomId}`,
        limits.room,
      ]);
    for (const [scope, maximum] of scopes) {
      const retry = check(scope, maximum);
      if (retry) {
        reply.header("retry-after", retry);
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "The API key, project or room request limit was reached; retry after the indicated delay",
        );
      }
    }
  });
}
