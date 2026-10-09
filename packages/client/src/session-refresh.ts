import type { ParticipantJoinAcceptedPayload } from "@relayrtc/protocol";
import { readParticipantToken, type ParticipantTokenInfo } from "./participant-token.js";
import type { CredentialRefreshContext, RoomCredentialSnapshot } from "./room-credentials.js";
import { RoomError, type RoomErrorCode } from "./room-errors.js";
import type { RoomRtc } from "./room-rtc.js";
import type { RelayClientOptions } from "./room.js";
import type { SignalingClient } from "./signaling-client.js";

type CredentialKind = "token" | "turn";
interface IceCredentials {
  readonly expiresAt: number;
  readonly iceServers: readonly RTCIceServer[];
}

export class SessionRefresh {
  #closed = false;
  #scope: ParticipantJoinAcceptedPayload | undefined;
  #token: ParticipantTokenInfo | undefined;
  #turn: IceCredentials | undefined;
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #controllers = new Set<AbortController>();
  readonly #pending = new Map<CredentialKind, Promise<void>>();

  constructor(
    readonly options: RelayClientOptions,
    readonly signaling: SignalingClient,
    readonly rtc: RoomRtc,
    readonly onFailure: (error: RoomError) => void,
    readonly onRefreshed: (snapshot: RoomCredentialSnapshot) => void,
  ) {}

  async prepare(
    token: string,
    scope: ParticipantJoinAcceptedPayload,
  ): Promise<readonly RTCIceServer[] | undefined> {
    this.#scope = scope;
    this.#token = readParticipantToken(token);
    this.#schedule("token", this.#token.expiresAt, !!this.options.refreshToken);
    const turnProvider = this.options.refreshTurnCredentials;
    if (this.options.turnCredentials) {
      try {
        this.#turn = readTurnCredentials(this.options.turnCredentials);
      } catch (error) {
        if (
          !turnProvider ||
          !(error instanceof RoomError) ||
          error.code !== "TURN_CREDENTIALS_EXPIRED"
        )
          throw error;
      }
    }
    if (!this.#turn && turnProvider) {
      const credentials = await this.#bounded(
        (signal) => turnProvider(this.#context("turn", "initial", signal)),
        "TURN_REFRESH_FAILED",
      );
      this.#assertOpen();
      if (!credentials)
        throw new RoomError("CREDENTIALS_REVOKED", "The application refused TURN credentials");
      this.#turn = readTurnCredentials(credentials);
    }
    this.#assertOpen();
    return this.#turn
      ? [...(this.options.iceServers ?? []), ...this.#turn.iceServers]
      : this.options.iceServers;
  }

  start(): void {
    this.#assertOpen();
    if (this.#token && this.#token.expiresAt <= Date.now())
      throw new RoomError("TOKEN_EXPIRED", "The participant token expired during room setup");
    if (this.#turn && this.#turn.expiresAt <= Date.now())
      throw new RoomError(
        "TURN_CREDENTIALS_EXPIRED",
        "The TURN credentials expired during room setup",
      );
    if (this.#turn)
      this.#schedule("turn", this.#turn.expiresAt, !!this.options.refreshTurnCredentials);
  }

  async refresh(): Promise<void> {
    this.#assertOpen();
    if (!this.options.refreshToken && !this.options.refreshTurnCredentials)
      throw new RoomError(
        "INVALID_CONFIGURATION",
        "Configure an application credential refresh callback",
      );
    if (this.options.refreshToken) await this.#renew("token", "manual");
    if (this.options.refreshTurnCredentials) await this.#renew("turn", "manual");
  }

  #context(
    kind: CredentialKind,
    reason: CredentialRefreshContext["reason"],
    signal: AbortSignal,
  ): CredentialRefreshContext {
    const scope = this.#scope;
    if (!scope) throw new RoomError("NOT_CONNECTED", "The room credential session is unavailable");
    const expiresAt = kind === "token" ? this.#token?.expiresAt : this.#turn?.expiresAt;
    return {
      roomId: scope.room.id,
      participantId: scope.localParticipant.id,
      sessionId: scope.session.id,
      expiresAt: expiresAt === undefined ? null : new Date(expiresAt).toISOString(),
      reason,
      signal,
    };
  }

  #schedule(kind: CredentialKind, expiresAt: number, renewable: boolean): void {
    for (const suffix of ["expiry", "renew"]) {
      clearTimeout(this.#timers.get(`${kind}:${suffix}`));
      this.#timers.delete(`${kind}:${suffix}`);
    }
    const remaining = expiresAt - Date.now();
    this.#timers.set(
      `${kind}:expiry`,
      setTimeout(
        () => {
          if (!this.#closed)
            this.onFailure(
              new RoomError(
                kind === "token" ? "TOKEN_EXPIRED" : "TURN_CREDENTIALS_EXPIRED",
                `The ${kind === "token" ? "participant token" : "TURN credentials"} expired`,
              ),
            );
        },
        Math.max(0, Math.min(remaining, 2_147_483_647)),
      ),
    );
    if (renewable) {
      const margin = Math.min(
        this.options.credentialRefreshMarginMs ?? 60_000,
        Math.max(250, remaining / 2),
      );
      this.#timers.set(
        `${kind}:renew`,
        setTimeout(
          () => {
            void this.#renew(kind, "expiring").catch(() => undefined);
          },
          Math.max(0, Math.min(remaining - margin, 2_147_483_647)),
        ),
      );
    }
  }

  #renew(kind: CredentialKind, reason: "manual" | "expiring"): Promise<void> {
    const existing = this.#pending.get(kind);
    if (existing) return existing;
    const operation = this.#performRenewal(kind, reason).catch((error: unknown) => {
      const failure =
        error instanceof RoomError
          ? error
          : new RoomError(
              kind === "token" ? "TOKEN_REFRESH_FAILED" : "TURN_REFRESH_FAILED",
              "The application could not renew room credentials",
            );
      if (!this.#closed) this.onFailure(failure);
      throw failure;
    });
    this.#pending.set(kind, operation);
    void operation
      .finally(() => {
        if (this.#pending.get(kind) === operation) this.#pending.delete(kind);
      })
      .catch(() => undefined);
    return operation;
  }

  async #performRenewal(kind: CredentialKind, reason: "manual" | "expiring"): Promise<void> {
    this.#assertOpen();
    if (kind === "token") {
      const provider = this.options.refreshToken;
      const current = this.#token;
      const scope = this.#scope;
      if (!provider || !current || !scope)
        throw new RoomError("TOKEN_REFRESH_FAILED", "The token refresh provider is unavailable");
      const token = await this.#bounded(
        (signal) => provider(this.#context(kind, reason, signal)),
        "TOKEN_REFRESH_FAILED",
      );
      this.#assertOpen();
      if (!token)
        throw new RoomError(
          "CREDENTIALS_REVOKED",
          "The application refused participant-token renewal",
        );
      let next: ParticipantTokenInfo;
      try {
        next = readParticipantToken(token);
      } catch {
        throw new RoomError(
          "TOKEN_REFRESH_FAILED",
          "The replacement participant token is invalid or expired",
        );
      }
      if (next.grant !== current.grant)
        throw new RoomError(
          "CREDENTIALS_REVOKED",
          "Credential renewal changed the participant identity or permissions",
        );
      if (next.expiresAt <= current.expiresAt)
        throw new RoomError("TOKEN_REFRESH_FAILED", "The replacement token must extend expiration");
      try {
        const response = await this.signaling.request(
          "session.refresh",
          { roomId: scope.room.id, sessionId: scope.session.id, participantToken: token },
          "session.refresh.accepted",
        );
        this.#assertOpen();
        if (
          response.roomId !== scope.room.id ||
          response.sessionId !== scope.session.id ||
          Date.parse(response.expiresAt) !== next.expiresAt
        )
          throw new RoomError(
            "PROTOCOL_ERROR",
            "The refreshed session does not match the participant token",
          );
      } catch (error) {
        if (
          error instanceof RoomError &&
          (error.code === "PERMISSION_DENIED" || error.code === "AUTHENTICATION_FAILED")
        )
          throw new RoomError(
            "CREDENTIALS_REVOKED",
            "The server refused participant-token renewal",
          );
        throw error;
      }
      this.#token = next;
      this.#schedule("token", next.expiresAt, true);
    } else {
      const provider = this.options.refreshTurnCredentials;
      if (!provider)
        throw new RoomError("TURN_REFRESH_FAILED", "The TURN refresh provider is unavailable");
      const credentials = await this.#bounded(
        (signal) => provider(this.#context(kind, reason, signal)),
        "TURN_REFRESH_FAILED",
      );
      this.#assertOpen();
      if (!credentials)
        throw new RoomError("CREDENTIALS_REVOKED", "The application refused TURN renewal");
      const next = readTurnCredentials(credentials);
      if (this.#turn && next.expiresAt <= this.#turn.expiresAt)
        throw new RoomError(
          "TURN_REFRESH_FAILED",
          "The replacement TURN credentials must extend expiration",
        );
      await this.#bounded(
        () => this.rtc.renewIceServers([...(this.options.iceServers ?? []), ...next.iceServers]),
        "TURN_REFRESH_FAILED",
      );
      this.#assertOpen();
      this.#turn = next;
      this.#schedule("turn", next.expiresAt, true);
    }
    const token = this.#token;
    if (token)
      this.onRefreshed({
        tokenExpiresAt: new Date(token.expiresAt).toISOString(),
        turnExpiresAt: this.#turn ? new Date(this.#turn.expiresAt).toISOString() : null,
      });
  }

  #bounded<Value>(
    task: (signal: AbortSignal) => Promise<Value>,
    code: RoomErrorCode,
  ): Promise<Value> {
    this.#assertOpen();
    const controller = new AbortController();
    this.#controllers.add(controller);
    return new Promise((resolve, reject) => {
      const aborted = (): void => {
        reject(
          controller.signal.reason instanceof RoomError
            ? controller.signal.reason
            : new RoomError(code, "Credential renewal was cancelled"),
        );
      };
      controller.signal.addEventListener("abort", aborted, { once: true });
      const timer = setTimeout(() => {
        controller.abort(new RoomError(code, "Credential renewal timed out"));
      }, this.options.requestTimeoutMs ?? 10_000);
      const cleanup = (): void => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", aborted);
        this.#controllers.delete(controller);
      };
      controller.signal.addEventListener("abort", cleanup, { once: true });
      void Promise.resolve()
        .then(() => {
          this.#assertOpen();
          return task(controller.signal);
        })
        .then(
          (value) => {
            cleanup();
            resolve(value);
          },
          (error: unknown) => {
            cleanup();
            reject(
              error instanceof RoomError
                ? error
                : new RoomError(code, "The application could not renew credentials"),
            );
          },
        );
    });
  }

  #assertOpen(): void {
    if (this.#closed)
      throw new RoomError("NOT_CONNECTED", "The room credential session has closed");
  }

  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    for (const controller of this.#controllers)
      controller.abort(new RoomError("NOT_CONNECTED", "The room credential session has closed"));
    this.#controllers.clear();
  }
}

function readTurnCredentials(input: unknown): IceCredentials {
  const invalid = (): never => {
    throw new RoomError(
      "TURN_REFRESH_FAILED",
      "Provide valid TURN credentials with an expiration and password-authenticated ICE servers",
    );
  };
  if (typeof input !== "object" || input === null) return invalid();
  const value = input as Record<string, unknown>;
  if (
    typeof value.expiresAt !== "string" ||
    typeof value.username !== "string" ||
    !value.username ||
    typeof value.ttlSeconds !== "number" ||
    !Number.isInteger(value.ttlSeconds) ||
    value.ttlSeconds < 1 ||
    value.ttlSeconds > 3600 ||
    !Array.isArray(value.iceServers) ||
    value.iceServers.length === 0
  )
    return invalid();
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiresAt)) return invalid();
  if (expiresAt > Date.now() + 3_605_000) return invalid();
  if (expiresAt <= Date.now())
    throw new RoomError("TURN_CREDENTIALS_EXPIRED", "The supplied TURN credentials have expired");
  let hasTurn = false;
  const iceServers: RTCIceServer[] = [];
  for (const entry of value.iceServers as readonly unknown[]) {
    if (typeof entry !== "object" || entry === null) return invalid();
    const server = entry as Record<string, unknown>;
    if (
      !Array.isArray(server.urls) ||
      server.urls.length === 0 ||
      !server.urls.every(
        (url: unknown): url is string =>
          typeof url === "string" && /^(?:stun|stuns|turn|turns):[^\s]+$/u.test(url),
      )
    )
      return invalid();
    const urls = server.urls;
    if (server.username !== undefined && typeof server.username !== "string") return invalid();
    if (server.credential !== undefined && typeof server.credential !== "string") return invalid();
    const turn = urls.some((url) => /^turns?:/u.test(url));
    if (
      turn &&
      (server.username !== value.username ||
        typeof server.credential !== "string" ||
        !server.credential ||
        (server.credentialType !== undefined && server.credentialType !== "password"))
    )
      return invalid();
    hasTurn ||= turn;
    iceServers.push({
      urls: [...urls],
      ...(server.username ? { username: server.username } : {}),
      ...(server.credential ? { credential: server.credential } : {}),
    });
  }
  if (!hasTurn) return invalid();
  return { expiresAt, iceServers };
}
