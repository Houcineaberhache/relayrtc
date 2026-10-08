export type CredentialEnvironment = Readonly<Record<string, string | undefined>>;

export const developmentInternalSecret = "development-internal-secret-change-me";

const credentialNames = [
  "PARTICIPANT_TOKEN_SIGNING_SECRET",
  "RELAYRTC_INTERNAL_SECRET",
  "BETTER_AUTH_SECRET",
  "TURN_SHARED_SECRET",
] as const;

export const isPlaceholderCredential = (value: string): boolean =>
  /^(replace-with|development-|test-|example-|placeholder)/iu.test(value) ||
  /change-?me/iu.test(value) ||
  /^(.)\1+$/u.test(value) ||
  ["password", "postgres", "relaykit", "0123456789abcdef0123456789abcdef"].includes(value);

export const enforceCredentialPolicy = (
  source: CredentialEnvironment,
  productionRequired: readonly string[] = [],
): void => {
  if (source.NODE_ENV && !["development", "test", "production"].includes(source.NODE_ENV)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const production = source.NODE_ENV === "production";
  if (production) {
    for (const name of productionRequired) {
      if (!source[name]?.trim()) throw new Error(`${name} is required in production`);
    }
  }
  for (const name of ["RELAYRTC_MEDIA_INTERNAL_URL", "RELAYRTC_SIGNALING_INTERNAL_URL"]) {
    const value = source[name];
    if (value === undefined) continue;
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(`${name} must be an HTTP URL without credentials, query, or fragment`);
    }
  }
  const configured = credentialNames.flatMap((name) => {
    const value = source[name];
    if (value === undefined) return [];
    if (value.length < 32 || value !== value.trim()) {
      throw new Error(`${name} must contain at least 32 characters without surrounding whitespace`);
    }
    if (production && isPlaceholderCredential(value)) {
      throw new Error(`${name} must not use a placeholder or development credential in production`);
    }
    return [{ name, value }];
  });
  for (let index = 0; index < configured.length; index++) {
    const credential = configured[index];
    if (!credential) continue;
    for (const other of configured.slice(index + 1)) {
      if (credential.value === other.value) {
        throw new Error(`${credential.name} and ${other.name} must use separate credentials`);
      }
    }
  }
  if (production && source.DATABASE_URL) {
    let url: URL;
    try {
      url = new URL(source.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
      if (!url.password || isPlaceholderCredential(decodeURIComponent(url.password))) {
        throw new Error();
      }
    } catch {
      throw new Error(
        "DATABASE_URL must use PostgreSQL with a non-placeholder password in production",
      );
    }
  }
};

export const readInternalSecret = (source: CredentialEnvironment): string => {
  const internalSecret = source.RELAYRTC_INTERNAL_SECRET ?? developmentInternalSecret;
  enforceCredentialPolicy({ ...source, RELAYRTC_INTERNAL_SECRET: internalSecret });
  return internalSecret;
};
