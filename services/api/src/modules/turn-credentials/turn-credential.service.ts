import { createHmac, randomUUID } from "node:crypto";

import type { TurnCredentials } from "@relayrtc/types";

export interface TurnCredentialScope {
  readonly environmentId: string;
  readonly projectId: string;
}

export interface TurnCredentialIssuer {
  issue(scope: TurnCredentialScope): TurnCredentials;
}

interface TurnCredentialServiceOptions {
  readonly clock?: () => Date;
  readonly createId?: () => string;
  readonly secret: string;
  readonly stunUrls: readonly string[];
  readonly ttlSeconds: number;
  readonly turnUrls: readonly string[];
}

export const createTurnCredentialService = (
  options: TurnCredentialServiceOptions,
): TurnCredentialIssuer => ({
  issue(scope) {
    const now = options.clock?.() ?? new Date();
    const expiresAtSeconds = Math.floor(now.getTime() / 1_000) + options.ttlSeconds;
    const createId = options.createId ?? (() => randomUUID().replaceAll("-", ""));
    const username = [expiresAtSeconds, scope.projectId, scope.environmentId, createId()].join(":");
    const credential = createHmac("sha1", options.secret).update(username).digest("base64");

    return {
      expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
      iceServers: [
        { urls: [...options.stunUrls] },
        {
          credential,
          credentialType: "password",
          urls: [...options.turnUrls],
          username,
        },
      ],
      ttlSeconds: options.ttlSeconds,
      username,
    };
  },
});
