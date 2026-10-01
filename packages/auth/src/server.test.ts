import { createDatabase } from "@relayrtc/database";
import { describe, expect, it } from "vitest";

import { createRelayKitAuth, createRelayKitAuthHandler } from "./server.js";

const oauthProviders = {
  github: {
    clientId: "github-client-id",
    clientSecret: "github-client-secret",
  },
  google: {
    clientId: "google-client-id",
    clientSecret: "google-client-secret",
  },
};

describe("createRelayKitAuth", () => {
  it("creates a database-backed Better Auth instance", async () => {
    const database = createDatabase("postgresql://relaykit:password@127.0.0.1:1/relaykit");
    const auth = createRelayKitAuth({
      baseUrl: "http://localhost:3000",
      database: database.db,
      oauthProviders,
      secret: "0123456789abcdef0123456789abcdef",
    });

    expect(auth.options.appName).toBe("RelayRTC");
    expect(auth.options.baseURL).toBe("http://localhost:3000");
    expect(auth.options.emailAndPassword).toMatchObject({
      autoSignIn: true,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
    });
    expect(auth.options.session).toEqual({
      cookieCache: { enabled: false },
      deferSessionRefresh: true,
      expiresIn: 604_800,
      freshAge: 900,
      storeSessionInDatabase: true,
      updateAge: 86_400,
    });
    expect(auth.options.advanced?.defaultCookieAttributes).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
    expect(auth.options.socialProviders).toMatchObject({
      github: {
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
      },
      google: {
        clientId: "google-client-id",
        clientSecret: "google-client-secret",
        prompt: "select_account",
      },
    });
    expect(auth.options.account).toMatchObject({
      accountLinking: {
        disableImplicitLinking: false,
        enabled: true,
      },
      encryptOAuthTokens: true,
    });

    await database.close();
  });

  it.each([
    ["not-an-email", "password123", "INVALID_EMAIL"],
    ["developer@example.com", "1234567", "PASSWORD_TOO_SHORT"],
  ])(
    "rejects invalid email/password input before database access",
    async (email, password, expectedCode) => {
      const database = createDatabase("postgresql://relaykit:password@127.0.0.1:1/relaykit");
      const auth = createRelayKitAuth({
        baseUrl: "http://localhost:3000",
        database: database.db,
        oauthProviders,
        secret: "0123456789abcdef0123456789abcdef",
      });
      const handler = createRelayKitAuthHandler(auth);
      const response = await handler(
        new Request("http://localhost:3000/api/auth/sign-up/email", {
          body: JSON.stringify({ email, name: "Developer", password }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(
        expectedCode === "INVALID_EMAIL"
          ? {
              code: "INVALID_EMAIL",
              description: "Enter a valid email address",
            }
          : {
              code: "INVALID_PASSWORD",
              description: "Password must contain between 8 and 128 characters",
            },
      );

      await database.close();
    },
  );

  it.each([
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/revoke-other-sessions"],
    ["POST", "/api/auth/revoke-sessions"],
  ])("returns the stable session error for unauthenticated %s %s", async (method, path) => {
    const database = createDatabase("postgresql://relaykit:password@127.0.0.1:1/relaykit");
    const auth = createRelayKitAuth({
      baseUrl: "http://localhost:3000",
      database: database.db,
      oauthProviders,
      secret: "0123456789abcdef0123456789abcdef",
    });
    const handler = createRelayKitAuthHandler(auth);
    const response = await handler(
      new Request(`http://localhost:3000${path}`, {
        headers: { origin: "http://localhost:3000" },
        method,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "SESSION_REQUIRED",
      description: "Sign in to continue",
    });

    await database.close();
  });

  it("returns null when no current session exists", async () => {
    const database = createDatabase("postgresql://relaykit:password@127.0.0.1:1/relaykit");
    const auth = createRelayKitAuth({
      baseUrl: "http://localhost:3000",
      database: database.db,
      oauthProviders,
      secret: "0123456789abcdef0123456789abcdef",
    });
    const handler = createRelayKitAuthHandler(auth);
    const response = await handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { origin: "http://localhost:3000" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();

    await database.close();
  });
});
