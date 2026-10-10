import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

export class WebhookDestinationError extends Error {
  constructor(readonly statusCode?: number) {
    super("Webhook destinations must resolve exclusively to public HTTP or HTTPS addresses");
    this.name = "WebhookDestinationError";
  }
}

export class WebhookResolutionError extends Error {
  constructor() {
    super("Webhook destination DNS resolution is unavailable");
    this.name = "WebhookResolutionError";
  }
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
blocked.addAddress("168.63.129.16", "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");

export const isPublicWebhookAddress = (address: string) => {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 && globalIPv6.check(address, "ipv6") && !blocked.check(address, "ipv6");
};

export type WebhookAddressResolver = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;
const resolveAddresses: WebhookAddressResolver = async (hostname) => {
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      reject(new WebhookResolutionError());
    }, 5000).unref();
    void lookup(hostname, { all: true, verbatim: true })
      .then(accept, reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
};

export async function validateWebhookDestination(
  value: string,
  resolve: WebhookAddressResolver = resolveAddresses,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebhookDestinationError();
  }
  if (
    value.length > 2048 ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new WebhookDestinationError();
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  const canonical = hostname.replace(/\.$/u, "");
  if (
    !canonical ||
    canonical === "localhost" ||
    /\.(localhost|local|internal|invalid|test|onion)$/u.test(canonical)
  )
    throw new WebhookDestinationError();
  const family = isIP(hostname);
  let addresses;
  try {
    addresses = family ? [{ address: hostname, family }] : await resolve(hostname);
  } catch {
    throw new WebhookResolutionError();
  }
  if (
    addresses.length === 0 ||
    addresses.some(
      (entry) => isIP(entry.address) !== entry.family || !isPublicWebhookAddress(entry.address),
    )
  )
    throw new WebhookDestinationError();
  const address = addresses[0];
  if (!address) throw new WebhookDestinationError();
  return { url, hostname, address };
}

export async function postWebhookRequest(
  value: string,
  body: string,
  headers: Readonly<Record<string, string>>,
  resolve?: WebhookAddressResolver,
) {
  if (Buffer.byteLength(body) > 1_048_576)
    throw new Error("Webhook payload exceeds the delivery limit");
  const destination = await validateWebhookDestination(value, resolve);
  return new Promise<{ statusCode: number }>((accept, reject) => {
    const request = (destination.url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        hostname: destination.address.address,
        family: destination.address.family,
        port: destination.url.port || (destination.url.protocol === "https:" ? 443 : 80),
        ...(destination.url.protocol === "https:"
          ? { servername: isIP(destination.hostname) ? "" : destination.hostname }
          : {}),
        method: "POST",
        path: destination.url.pathname + destination.url.search,
        agent: false,
        signal: AbortSignal.timeout(10_000),
        headers: {
          ...headers,
          host: destination.url.host,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        response.destroy();
        if (statusCode >= 300 && statusCode < 400) reject(new WebhookDestinationError(statusCode));
        else accept({ statusCode });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

export const webhookEncryptionKeyValid = (value: string) =>
  /^[A-Za-z0-9+/]{43}=$/u.test(value) &&
  Buffer.from(value, "base64").length === 32 &&
  Buffer.from(value, "base64").toString("base64") === value;

export function createWebhookSecretVault(encodedKey: string) {
  if (!webhookEncryptionKeyValid(encodedKey))
    throw new Error("WEBHOOK_SIGNING_ENCRYPTION_KEY must encode exactly 32 random bytes as base64");
  const key = Buffer.from(encodedKey, "base64");
  const keyId = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return {
    generate: () => `whsec_${randomBytes(32).toString("base64url")}`,
    encrypt(secret: string, context: string) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(context));
      const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
      return [
        "v1",
        keyId,
        nonce.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(".");
    },
    decrypt(value: string, context: string) {
      const [version, storedKeyId, nonce, tag, ciphertext, extra] = value.split(".");
      if (
        version !== "v1" ||
        storedKeyId !== keyId ||
        !nonce ||
        !tag ||
        !ciphertext ||
        extra !== undefined
      )
        throw new Error("The webhook secret encryption key or ciphertext is invalid");
      const nonceBytes = Buffer.from(nonce, "base64url");
      const tagBytes = Buffer.from(tag, "base64url");
      if (nonceBytes.length !== 12 || tagBytes.length !== 16)
        throw new Error("The webhook secret ciphertext is invalid");
      const decipher = createDecipheriv("aes-256-gcm", key, nonceBytes);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(tagBytes);
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

export const webhookSecretContext = (endpoint: {
  id: string;
  projectId: string;
  environmentId: string;
  signingSecretVersion: number;
}) =>
  JSON.stringify([
    endpoint.id,
    endpoint.projectId,
    endpoint.environmentId,
    endpoint.signingSecretVersion,
  ]);
