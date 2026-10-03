import { describe, expect, it } from "vitest";

import { readMediaEnvironment } from "./environment.js";

describe("readMediaEnvironment", () => {
  it("provides local defaults", () => {
    expect(readMediaEnvironment({})).toEqual({
      host: "0.0.0.0",
      logLevel: "info",
      maxRoomsPerWorker: 100,
      maxTransportsPerRoom: 200,
      nodeEnvironment: "development",
      nodeId: "media-local",
      port: 8082,
      rtcAnnouncedAddress: "127.0.0.1",
      rtcListenIp: "0.0.0.0",
      rtcMaxPort: 40_003,
      rtcPort: 40_000,
      workerCount: 1,
    });
  });

  it("reads configured service values", () => {
    expect(
      readMediaEnvironment({
        MEDIA_HOST: "127.0.0.1",
        MEDIA_LOG_LEVEL: "debug",
        MEDIA_MAX_ROOMS_PER_WORKER: "50",
        MEDIA_MAX_TRANSPORTS_PER_ROOM: "80",
        MEDIA_NODE_ID: "media-2",
        MEDIA_PORT: "9082",
        MEDIA_RTC_ANNOUNCED_ADDRESS: "203.0.113.10",
        MEDIA_RTC_LISTEN_IP: "10.0.0.10",
        MEDIA_RTC_MAX_PORT: "41003",
        MEDIA_RTC_PORT: "41000",
        MEDIA_WORKERS: "4",
        NODE_ENV: "production",
      }),
    ).toEqual({
      host: "127.0.0.1",
      logLevel: "debug",
      maxRoomsPerWorker: 50,
      maxTransportsPerRoom: 80,
      nodeEnvironment: "production",
      nodeId: "media-2",
      port: 9082,
      rtcAnnouncedAddress: "203.0.113.10",
      rtcListenIp: "10.0.0.10",
      rtcMaxPort: 41_003,
      rtcPort: 41_000,
      workerCount: 4,
    });
  });

  it("rejects invalid ports", () => {
    expect(() => readMediaEnvironment({ MEDIA_PORT: "70000" })).toThrow(
      "Invalid media service configuration",
    );
  });

  it("requires one RTC port per worker", () => {
    expect(() =>
      readMediaEnvironment({
        MEDIA_RTC_MAX_PORT: "40001",
        MEDIA_RTC_PORT: "40000",
        MEDIA_WORKERS: "3",
      }),
    ).toThrow("RTC port range must provide one port per media worker");
  });
});
