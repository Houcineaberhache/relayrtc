import { SignJWT } from "jose";

import type { Metadata } from "@relayrtc/types";

import type { ParticipantPermission } from "./participant-token.schema.js";

export interface ParticipantTokenClaims {
  environmentId: string;
  expiresAt: string;
  issuedAt: string;
  metadata: Metadata;
  participantId: string;
  participantName: string;
  permissions: readonly ParticipantPermission[];
  projectId: string;
  roomId: string;
  tokenId: string;
}

export interface ParticipantTokenSigner {
  sign(claims: ParticipantTokenClaims): Promise<string>;
}

export interface ParticipantTokenSignerConfig {
  audience: string;
  issuer: string;
  keyId: string;
  secret: string;
}

export const createParticipantTokenSigner = (
  config: ParticipantTokenSignerConfig,
): ParticipantTokenSigner => {
  const secret = new TextEncoder().encode(config.secret);

  return {
    sign: (claims) => {
      const issuedAt = Math.floor(Date.parse(claims.issuedAt) / 1_000);
      const expiresAt = Math.floor(Date.parse(claims.expiresAt) / 1_000);

      return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: "HS256", kid: config.keyId, typ: "JWT" })
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setSubject(claims.participantId)
        .setJti(claims.tokenId)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(secret);
    },
  };
};
