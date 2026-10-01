import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
