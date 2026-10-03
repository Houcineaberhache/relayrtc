export interface TurnIceServer {
  readonly urls: readonly string[];
  readonly username?: string;
  readonly credential?: string;
  readonly credentialType?: "password";
}

export interface TurnCredentials {
  readonly expiresAt: string;
  readonly iceServers: readonly TurnIceServer[];
  readonly ttlSeconds: number;
  readonly username: string;
}
