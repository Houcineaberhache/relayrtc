import { describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";
import type { MediaConfig } from "./config/environment.js";
import type { MediaEngine } from "./engine/media-engine.js";

const config: MediaConfig = {
  databaseUrl: "postgresql://relaykit:password@localhost:5432/relaykit",
  internalSecret: "test-internal-secret-at-least-32-characters",
  host: "127.0.0.1",
  logLevel: "silent",
  maxRoomsPerWorker: 10,
  maxTransportsPerRoom: 20,
  nodeEnvironment: "test",
  nodeId: "media-test",
  port: 8082,
  rtcAnnouncedAddress: "127.0.0.1",
  rtcListenIp: "127.0.0.1",
  rtcMaxPort: 40_003,
  rtcPort: 40_000,
  workerCount: 1,
  signalingInternalUrl: "http://signaling:8081/internal/v1",
};

describe("media service", () => {
  it.each(["/health", "/ready"])("serves %s", async (path) => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "GET", url: path });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.json()).toEqual({
      nodeId: "media-test",
      service: "relayrtc-media",
      status: path === "/ready" ? "ready" : "ok",
    });

    await app.close();
  });

  it("closes the media engine during shutdown", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const engine = { close } as unknown as MediaEngine;
    const app = buildApp({ config, engine });

    await app.close();

    expect(close).toHaveBeenCalledOnce();
  });
});
