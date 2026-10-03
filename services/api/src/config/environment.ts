import { z } from "zod";

export type ApiEnvironmentSource = Readonly<Record<string, string | undefined>>;

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const iceUrls = (protocols: readonly string[]) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1))
    .refine(
      (values) =>
        values.every((value) => protocols.some((protocol) => value.startsWith(`${protocol}:`))),
      `URLs must use ${protocols.join(" or ")}`,
    );

const environmentSchema = z
  .object({
    API_HOST: z.string().trim().min(1).default("0.0.0.0"),
    API_LOG_LEVEL: z.enum(logLevels).default("info"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    API_TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DATABASE_URL: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "postgres:" || url.protocol === "postgresql:";
        } catch {
          return false;
        }
      }, "DATABASE_URL must be a valid PostgreSQL URL"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PARTICIPANT_TOKEN_AUDIENCE: z.string().trim().min(1).default("relayrtc-realtime"),
    PARTICIPANT_TOKEN_ISSUER: z.string().trim().min(1).default("relayrtc-api"),
    PARTICIPANT_TOKEN_KEY_ID: z.string().trim().min(1).max(128).default("participant-v1"),
    PARTICIPANT_TOKEN_SIGNING_SECRET: z.string().min(32),
    TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
    TURN_SHARED_SECRET: z.string().min(32),
    TURN_STUN_URLS: iceUrls(["stun", "stuns"]).default(["stun:localhost:3478"]),
    TURN_URLS: iceUrls(["turn", "turns"]).default([
      "turn:localhost:3478?transport=udp",
      "turn:localhost:3478?transport=tcp",
      "turns:localhost:5349?transport=tcp",
    ]),
  })
  .strict();

export interface ApiConfig {
  databaseUrl: string;
  host: string;
  logLevel: (typeof logLevels)[number];
  nodeEnvironment: "development" | "test" | "production";
  participantTokenAudience: string;
  participantTokenIssuer: string;
  participantTokenKeyId: string;
  participantTokenSigningSecret: string;
  port: number;
  trustProxy: boolean;
  turnCredentialTtlSeconds: number;
  turnSharedSecret: string;
  turnStunUrls: readonly string[];
  turnUrls: readonly string[];
}

export const readApiEnvironment = (source: ApiEnvironmentSource): ApiConfig => {
  const parsed = environmentSchema.safeParse({
    API_HOST: source.API_HOST,
    API_LOG_LEVEL: source.API_LOG_LEVEL,
    API_PORT: source.API_PORT,
    API_TRUST_PROXY: source.API_TRUST_PROXY,
    DATABASE_URL: source.DATABASE_URL,
    NODE_ENV: source.NODE_ENV,
    PARTICIPANT_TOKEN_AUDIENCE: source.PARTICIPANT_TOKEN_AUDIENCE,
    PARTICIPANT_TOKEN_ISSUER: source.PARTICIPANT_TOKEN_ISSUER,
    PARTICIPANT_TOKEN_KEY_ID: source.PARTICIPANT_TOKEN_KEY_ID,
    PARTICIPANT_TOKEN_SIGNING_SECRET: source.PARTICIPANT_TOKEN_SIGNING_SECRET,
    TURN_CREDENTIAL_TTL_SECONDS: source.TURN_CREDENTIAL_TTL_SECONDS,
    TURN_SHARED_SECRET: source.TURN_SHARED_SECRET,
    TURN_STUN_URLS: source.TURN_STUN_URLS,
    TURN_URLS: source.TURN_URLS,
  });

  if (!parsed.success) {
    const description = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API configuration: ${description}`);
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.API_HOST,
    logLevel: parsed.data.API_LOG_LEVEL,
    nodeEnvironment: parsed.data.NODE_ENV,
    participantTokenAudience: parsed.data.PARTICIPANT_TOKEN_AUDIENCE,
    participantTokenIssuer: parsed.data.PARTICIPANT_TOKEN_ISSUER,
    participantTokenKeyId: parsed.data.PARTICIPANT_TOKEN_KEY_ID,
    participantTokenSigningSecret: parsed.data.PARTICIPANT_TOKEN_SIGNING_SECRET,
    port: parsed.data.API_PORT,
    trustProxy: parsed.data.API_TRUST_PROXY,
    turnCredentialTtlSeconds: parsed.data.TURN_CREDENTIAL_TTL_SECONDS,
    turnSharedSecret: parsed.data.TURN_SHARED_SECRET,
    turnStunUrls: parsed.data.TURN_STUN_URLS,
    turnUrls: parsed.data.TURN_URLS,
  };
};
