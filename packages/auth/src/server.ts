import { createDatabase, schema, type RelayKitDatabase } from "@relaykit/database";
import type { Auth, BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";

import { readAuthEnvironment, type AuthEnvironmentSource } from "./environment.js";
import { toAuthError } from "./errors.js";

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
  handler: (request: Request) => Promise<Response>;
}

export const createRelayKitAuth = (options: RelayKitAuthOptions): RelayKitAuth => {
  const configuration: BetterAuthOptions = {
    appName: "RelayKit",
    baseURL: options.baseUrl,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      autoSignIn: true,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 8,
    },
    secret: options.secret,
    trustedOrigins: options.trustedOrigins ?? [options.baseUrl],
  };

  return betterAuth(configuration);
};

export const createRelayKitAuthHandler =
  (auth: RelayKitAuth) =>
  async (request: Request): Promise<Response> => {
    const response = await auth.handler(request);

    if (response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      return response;
    }

    let payload: unknown;

    try {
      payload = await response.clone().json();
    } catch {
      payload = undefined;
    }

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");

    return new Response(JSON.stringify(toAuthError(payload)), {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
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
    handler: createRelayKitAuthHandler(auth),
  };
};
