export const sessionExpiresInSeconds = 60 * 60 * 24 * 7;
export const sessionUpdateAgeSeconds = 60 * 60 * 24;
export const sessionFreshAgeSeconds = 60 * 15;

export const relayKitSessionPolicy = {
  cookieCache: {
    enabled: false,
  },
  deferSessionRefresh: true,
  expiresIn: sessionExpiresInSeconds,
  freshAge: sessionFreshAgeSeconds,
  storeSessionInDatabase: true,
  updateAge: sessionUpdateAgeSeconds,
} as const;

export const sessionCookieAttributes = (baseUrl: string) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: new URL(baseUrl).protocol === "https:",
});
