import type { RelayKitDatabase } from "@relayrtc/database";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expireUsageHistory } from "./usage-retention.service.js";
import { registerUsageRetention } from "./usage-retention-worker.js";

vi.mock("./usage-retention.service.js", () => ({ expireUsageHistory: vi.fn() }));

describe("automatic usage retention", () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("sweeps at startup and daily, and stops before database shutdown", async () => {
    vi.useFakeTimers();
    const database = {} as RelayKitDatabase;
    const app = Fastify();
    vi.mocked(expireUsageHistory).mockResolvedValue({ status: "expired", cutoff: "2025-01-01T00:00:00.000Z" });
    const stop = registerUsageRetention(app, database, 365);
    const closeDatabase = vi.fn();
    app.addHook("onClose", async () => { await stop(); closeDatabase(); });
    await app.ready();
    expect(expireUsageHistory).toHaveBeenCalledWith(database, 365);
    await vi.advanceTimersByTimeAsync(86400_000);
    expect(expireUsageHistory).toHaveBeenCalledTimes(2);
    await app.close();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(86400_000);
    expect(expireUsageHistory).toHaveBeenCalledTimes(2);
  });

  it("retries a failed sweep in five minutes without overlapping runs", async () => {
    vi.useFakeTimers();
    const app = Fastify();
    vi.mocked(expireUsageHistory).mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValue({ status: "expired", cutoff: "2025-01-01T00:00:00.000Z" });
    const stop = registerUsageRetention(app, {} as RelayKitDatabase, 365);
    app.addHook("onClose", stop);
    await app.ready();
    await vi.advanceTimersByTimeAsync(299_999);
    expect(expireUsageHistory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(expireUsageHistory).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("waits for an ongoing sweep before closing", async () => {
    vi.useFakeTimers();
    const app = Fastify();
    let finish: () => void = () => undefined;
    vi.mocked(expireUsageHistory).mockResolvedValueOnce({ status: "expired", cutoff: "2025-01-01T00:00:00.000Z" })
      .mockImplementationOnce(() => new Promise((resolve) => { finish = () => { resolve({ status: "expired", cutoff: "2025-01-01T00:00:00.000Z" }); }; }));
    const stop = registerUsageRetention(app, {} as RelayKitDatabase, 365);
    app.addHook("onClose", stop);
    await app.ready();
    await vi.advanceTimersByTimeAsync(86400_000);
    let closed = false;
    const closing = app.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    finish();
    await closing;
    expect(closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
