import { z } from "zod";

export type MediaEnvironmentSource = Readonly<Record<string, string | undefined>>;

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const environmentSchema = z
  .object({
    MEDIA_HOST: z.string().trim().min(1).default("0.0.0.0"),
    MEDIA_LOG_LEVEL: z.enum(logLevels).default("info"),
    MEDIA_MAX_ROOMS_PER_WORKER: z.coerce.number().int().min(1).max(10_000).default(100),
    MEDIA_MAX_TRANSPORTS_PER_ROOM: z.coerce.number().int().min(1).max(10_000).default(200),
    MEDIA_NODE_ID: z.string().trim().min(1).max(128).default("media-local"),
    MEDIA_PORT: z.coerce.number().int().min(1).max(65_535).default(8082),
    MEDIA_RTC_ANNOUNCED_ADDRESS: z.string().trim().min(1).default("127.0.0.1"),
    MEDIA_RTC_LISTEN_IP: z.string().trim().min(1).default("0.0.0.0"),
    MEDIA_RTC_MAX_PORT: z.coerce.number().int().min(1).max(65_535).default(40_003),
    MEDIA_RTC_PORT: z.coerce.number().int().min(1).max(65_535).default(40_000),
    MEDIA_WORKERS: z.coerce.number().int().min(1).max(128).default(1),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .strict()
  .refine(
    (value) => value.MEDIA_RTC_PORT + value.MEDIA_WORKERS - 1 <= value.MEDIA_RTC_MAX_PORT,
    {
      message: "RTC port range must provide one port per media worker",
      path: ["MEDIA_RTC_MAX_PORT"],
    },
  );

export interface MediaConfig {
  host: string;
  logLevel: (typeof logLevels)[number];
  maxRoomsPerWorker: number;
  maxTransportsPerRoom: number;
  nodeEnvironment: "development" | "test" | "production";
  nodeId: string;
  port: number;
  rtcAnnouncedAddress: string;
  rtcListenIp: string;
  rtcMaxPort: number;
  rtcPort: number;
  workerCount: number;
}

export const readMediaEnvironment = (source: MediaEnvironmentSource): MediaConfig => {
  const parsed = environmentSchema.safeParse({
    MEDIA_HOST: source.MEDIA_HOST,
    MEDIA_LOG_LEVEL: source.MEDIA_LOG_LEVEL,
    MEDIA_MAX_ROOMS_PER_WORKER: source.MEDIA_MAX_ROOMS_PER_WORKER,
    MEDIA_MAX_TRANSPORTS_PER_ROOM: source.MEDIA_MAX_TRANSPORTS_PER_ROOM,
    MEDIA_NODE_ID: source.MEDIA_NODE_ID,
    MEDIA_PORT: source.MEDIA_PORT,
    MEDIA_RTC_ANNOUNCED_ADDRESS: source.MEDIA_RTC_ANNOUNCED_ADDRESS,
    MEDIA_RTC_LISTEN_IP: source.MEDIA_RTC_LISTEN_IP,
    MEDIA_RTC_MAX_PORT: source.MEDIA_RTC_MAX_PORT,
    MEDIA_RTC_PORT: source.MEDIA_RTC_PORT,
    MEDIA_WORKERS: source.MEDIA_WORKERS,
    NODE_ENV: source.NODE_ENV,
  });

  if (!parsed.success) {
    const description = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid media service configuration: ${description}`);
  }

  return {
    host: parsed.data.MEDIA_HOST,
    logLevel: parsed.data.MEDIA_LOG_LEVEL,
    maxRoomsPerWorker: parsed.data.MEDIA_MAX_ROOMS_PER_WORKER,
    maxTransportsPerRoom: parsed.data.MEDIA_MAX_TRANSPORTS_PER_ROOM,
    nodeEnvironment: parsed.data.NODE_ENV,
    nodeId: parsed.data.MEDIA_NODE_ID,
    port: parsed.data.MEDIA_PORT,
    rtcAnnouncedAddress: parsed.data.MEDIA_RTC_ANNOUNCED_ADDRESS,
    rtcListenIp: parsed.data.MEDIA_RTC_LISTEN_IP,
    rtcMaxPort: parsed.data.MEDIA_RTC_MAX_PORT,
    rtcPort: parsed.data.MEDIA_RTC_PORT,
    workerCount: parsed.data.MEDIA_WORKERS,
  };
};
