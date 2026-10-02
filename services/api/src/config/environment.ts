import { z } from "zod";

export type ApiEnvironmentSource = Readonly<Record<string, string | undefined>>;

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

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
  })
  .strict();

export interface ApiConfig {
  databaseUrl: string;
  host: string;
  logLevel: (typeof logLevels)[number];
  nodeEnvironment: "development" | "test" | "production";
  port: number;
  trustProxy: boolean;
}

export const readApiEnvironment = (source: ApiEnvironmentSource): ApiConfig => {
  const parsed = environmentSchema.safeParse({
    API_HOST: source.API_HOST,
    API_LOG_LEVEL: source.API_LOG_LEVEL,
    API_PORT: source.API_PORT,
    API_TRUST_PROXY: source.API_TRUST_PROXY,
    DATABASE_URL: source.DATABASE_URL,
    NODE_ENV: source.NODE_ENV,
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
    port: parsed.data.API_PORT,
    trustProxy: parsed.data.API_TRUST_PROXY,
  };
};
