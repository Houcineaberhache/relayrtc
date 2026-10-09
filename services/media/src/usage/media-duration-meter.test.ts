import { describe, expect, it, vi } from "vitest";
import type { MediaUsageMetricsStore } from "./usage-metrics-store.js";
import { MediaDurationMeter } from "./media-duration-meter.js";

function setup() {
  const recordBatch = vi
    .fn<NonNullable<MediaUsageMetricsStore["recordBatch"]>>()
    .mockResolvedValue(undefined);
  const meter = new MediaDurationMeter({ record: vi.fn(), recordBatch });
  return { meter, recordBatch };
}

describe("media participant durations", () => {
  it("preserves fractional seconds and counts simultaneous audio tracks once per participant", async () => {
    const { meter, recordBatch } = setup();
    meter.start("mic", "publisher", "audio", 0);
    meter.start("screen-audio", "publisher", "screen_audio", 250);
    await meter.flush("room", 1250);
    expect(recordBatch).toHaveBeenCalledTimes(1);
    expect(recordBatch.mock.calls[0]?.[2]).toEqual({ audioParticipantSeconds: 1.25 });
    meter.stop("mic", 1500);
    meter.stop("screen-audio", 1750);
    await meter.flush("room", 2500);
    expect(recordBatch.mock.calls[1]?.[2]).toEqual({ audioParticipantSeconds: 0.5 });
    await meter.flush("room", 3000);
    expect(recordBatch).toHaveBeenCalledTimes(2);
  });
  it("separates camera and screen share while counting video participation once", async () => {
    const { meter, recordBatch } = setup();
    meter.start("camera", "publisher", "camera_video", 0);
    meter.start("screen", "publisher", "screen_video", 500);
    await meter.flush("room", 1500);
    expect(recordBatch.mock.calls.map((call) => call[2])).toEqual(
      expect.arrayContaining([{ videoParticipantSeconds: 1.5 }, { screenShareSeconds: 1 }]),
    );
  });
  it("does not charge gaps between publications", async () => {
    const { meter, recordBatch } = setup();
    meter.start("first", "publisher", "audio", 0);
    meter.stop("first", 1000);
    meter.start("next", "publisher", "audio", 3000);
    await meter.flush("room", 3500);
    expect(recordBatch.mock.calls[0]?.[2]).toEqual({ audioParticipantSeconds: 1.5 });
  });
  it("retries the same sample identity and retains activity accrued during failure", async () => {
    const { meter, recordBatch } = setup();
    recordBatch.mockRejectedValueOnce(new Error("Database unavailable"));
    meter.start("mic", "publisher", "audio", 0);
    await expect(meter.flush("room", 1250)).rejects.toThrow();
    await meter.flush("room", 2000);
    expect(recordBatch.mock.calls[0]).toEqual(recordBatch.mock.calls[1]);
    await meter.flush("room", 2000);
    expect(recordBatch.mock.calls[2]?.[2]).toEqual({ audioParticipantSeconds: 0.75 });
  });
  it("serializes concurrent flushes without double counting", async () => {
    const { meter, recordBatch } = setup();
    let finish!: () => void;
    recordBatch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    meter.start("mic", "publisher", "audio", 0);
    const first = meter.flush("room", 1000);
    const second = meter.flush("room", 1250);
    expect(recordBatch).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    await meter.flush("room", 1250);
    expect(recordBatch.mock.calls[1]?.[2]).toEqual({ audioParticipantSeconds: 0.25 });
  });
});
