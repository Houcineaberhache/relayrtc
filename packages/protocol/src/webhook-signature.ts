import { createHmac, timingSafeEqual } from "node:crypto";

export const webhookSignatureContract = {
  version: "v1",
  algorithm: "HMAC-SHA256",
  signatureHeader: "x-relayrtc-signature",
  deliveryIdHeader: "x-relayrtc-delivery-id",
  replayCountHeader: "x-relayrtc-replay-count",
  secretVersionHeader: "x-relayrtc-signing-key-version",
  signedContent: "ASCII(timestamp.deliveryId.replayCount.) followed by the exact raw request body bytes",
  signatureFormat: "t=<Unix seconds>,v1=<lowercase hexadecimal HMAC>",
  secretEncoding: "Use the complete whsec_ signing secret as UTF-8 HMAC key bytes",
  toleranceSeconds: 300,
  deduplication: "Atomically persist the event id with business processing; retries and replays retain event and delivery ids",
  replay: "Explicit replay increments the signed replay count and resets the retry budget without creating a business event",
  attemptsPerRun: 8,
  maximumExplicitReplays: 100,
  concurrencyPerWorker: 4,
  leaseSeconds: 120,
  backoffSeconds: [5, 30, 120, 600, 1800, 3600, 21600],
  backoffJitter: "Each retry delay receives up to 20 percent additional random jitter",
  retryPolicy: "Retry DNS and network failures, HTTP 408, 425, 429 and 5xx; other HTTP failures and unsafe destinations are terminal",
  deliveryDeadlineSeconds: 10,
  dnsDeadlineSeconds: 5,
  maximumRunAgeDays: 7,
  terminalRetentionDays: 30,
  retention: "Retain deliveries and attempt logs for 30 days after their most recent terminal outcome; retain an event while any delivery still references it",
  replayInput: "Supply expectedReplayCount from the current delivery record; pending or delivering records cannot be replayed",
  replayDestination: "Replay uses the endpoint's current URL and signing secret; automatic retries retain the original delivery URL",
  verification: "Verify the timestamp, delivery id, replay count and signature against raw bytes before parsing JSON; compare signatures in constant time",
} as const;

const validDeliveryId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/u.test(value);
const validSecret = (value: string) => /^whsec_[A-Za-z0-9_-]{43}$/u.test(value);
const digest = (secret: string, body: string | Uint8Array, timestamp: number, deliveryId: string, replayCount: number) =>
  createHmac("sha256", secret).update(`${timestamp}.${deliveryId}.${replayCount}.`, "ascii").update(body).digest();

export function signWebhookRequest(secret: string, body: string | Uint8Array, context: { deliveryId: string; replayCount: number; timestamp?: number }) {
  const timestamp = context.timestamp ?? Math.floor(Date.now() / 1000);
  if (!validSecret(secret) || !validDeliveryId(context.deliveryId) || !Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isInteger(context.replayCount) || context.replayCount < 0 || context.replayCount > 100) throw new Error("Invalid webhook signing context");
  return {
    "x-relayrtc-delivery-id": context.deliveryId,
    "x-relayrtc-replay-count": String(context.replayCount),
    "x-relayrtc-signature": `t=${timestamp},v1=${digest(secret, body, timestamp, context.deliveryId, context.replayCount).toString("hex")}`,
  };
}

export function verifyWebhookRequest(secret: string, body: string | Uint8Array, headers: Readonly<Record<string, string | undefined>>, options: { now?: Date; toleranceSeconds?: number } = {}) {
  const match = /^t=([1-9][0-9]{0,12}),v1=([a-f0-9]{64})$/u.exec(headers["x-relayrtc-signature"] ?? "");
  const deliveryId = headers["x-relayrtc-delivery-id"] ?? "";
  const replayText = headers["x-relayrtc-replay-count"] ?? "";
  const timestamp = Number(match?.[1]);
  const signature = match?.[2];
  const replayCount = Number(replayText);
  const tolerance = options.toleranceSeconds ?? webhookSignatureContract.toleranceSeconds;
  const now = (options.now ?? new Date()).getTime() / 1000;
  if (!validSecret(secret) || !signature || !validDeliveryId(deliveryId) || !/^(0|[1-9][0-9]{0,2})$/u.test(replayText) || replayCount > 100 || !Number.isSafeInteger(timestamp) || !Number.isFinite(now) || !Number.isInteger(tolerance) || tolerance < 1 || tolerance > 300 || Math.abs(now - timestamp) > tolerance) return false;
  return timingSafeEqual(digest(secret, body, timestamp, deliveryId, replayCount), Buffer.from(signature, "hex"));
}
