import { createDatabase, schema, type RelayKitDatabase } from "@relaykit/database";
import type { Auth, BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";

import { readAuthEnvironment, type AuthEnvironmentSource } from "./environment.js";

export interface RelayKitAuthOptions {
  baseUrl: string;
  database: RelayKitDatabase;
  secret: string;
  trustedOrigins?: string[];
}

export type RelayKitAuth = Auth;

export interface RelayKitAuthEnvironmentResult {
  auth: RelayKitAuth;
  close: () => Promise<void>;
  database: RelayKitDatabase;
}

export const createRelayKitAuth = (options: RelayKitAuthOptions): RelayKitAuth => {
  const configuration: BetterAuthOptions = {
    appName: "RelayKit",
    baseURL: options.baseUrl,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema,
    }),
    secret: options.secret,
    trustedOrigins: options.trustedOrigins ?? [options.baseUrl],
  };

  return betterAuth(configuration);
};

export const createRelayKitAuthFromEnvironment = (
  source: AuthEnvironmentSource,
): RelayKitAuthEnvironmentResult => {
  const environment = readAuthEnvironment(source);
  const database = createDatabase(environment.databaseUrl);
  const auth = createRelayKitAuth({
    baseUrl: environment.baseUrl,
    database: database.db,
    secret: environment.secret,
    trustedOrigins: environment.trustedOrigins,
  });

  return {
    auth,
    close: database.close,
    database: database.db,
  };
};
