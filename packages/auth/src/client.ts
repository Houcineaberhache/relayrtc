import { createAuthClient } from "better-auth/client";

export const createRelayKitAuthClient = (baseURL?: string) =>
  createAuthClient(baseURL ? { baseURL } : undefined);

export type RelayKitAuthClient = ReturnType<typeof createRelayKitAuthClient>;
