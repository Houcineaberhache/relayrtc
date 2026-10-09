import type { TurnCredentials } from "@relayrtc/types";

export interface CredentialRefreshContext {
  readonly roomId: string;
  readonly participantId: string;
  readonly sessionId: string;
  readonly expiresAt: string | null;
  readonly reason: "initial" | "expiring" | "manual";
  readonly signal: AbortSignal;
}

export interface RoomCredentialOptions {
  readonly refreshToken?: (context: CredentialRefreshContext) => Promise<string | null>;
  readonly turnCredentials?: TurnCredentials;
  readonly refreshTurnCredentials?: (
    context: CredentialRefreshContext,
  ) => Promise<TurnCredentials | null>;
  readonly credentialRefreshMarginMs?: number;
}

export interface RoomCredentialSnapshot {
  readonly tokenExpiresAt: string;
  readonly turnExpiresAt: string | null;
}
