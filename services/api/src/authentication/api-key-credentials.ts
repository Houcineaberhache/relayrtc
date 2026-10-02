import { createHash, timingSafeEqual } from "node:crypto";

const rawKeyPattern = /^(rk_(?:pk|sk)_[a-z0-9-]+_)([A-Za-z0-9_-]{43})$/u;

export const apiKeyPrefixFromRaw = (rawKey: string): string | null => {
  const match = rawKeyPattern.exec(rawKey);
  const header = match?.[1];
  const secret = match?.[2];
  return header && secret ? `${header}${secret.slice(0, 12)}` : null;
};

export const apiKeyHashMatches = (rawKey: string, expectedHash: string): boolean => {
  const actual = Buffer.from(createHash("sha256").update(rawKey, "utf8").digest("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
