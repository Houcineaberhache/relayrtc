import { RoomError } from "./room-errors.js";

export interface ParticipantTokenInfo {
  readonly roomId: string;
  readonly participantId: string;
  readonly expiresAt: number;
  readonly grant: string;
}

export function readParticipantToken(token: string): ParticipantTokenInfo {
  try {
    if (
      typeof token !== "string" ||
      token.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)
    )
      throw new Error();
    const encoded = token.split(".")[1];
    if (!encoded) throw new Error();
    const bytes = Uint8Array.from(atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/")), (value) =>
      value.charCodeAt(0),
    );
    const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof input !== "object" || input === null) throw new Error();
    const claims = input as Record<string, unknown>;
    for (const field of ["roomId", "participantId", "projectId", "environmentId"]) {
      if (typeof claims[field] !== "string" || !/^\S{1,128}$/u.test(claims[field]))
        throw new Error();
    }
    if (
      typeof claims.exp !== "number" ||
      !Number.isSafeInteger(claims.exp) ||
      !Number.isSafeInteger(claims.exp * 1000) ||
      claims.exp * 1000 > 8.64e15
    )
      throw new Error();
    if (
      !Array.isArray(claims.permissions) ||
      !claims.permissions.every((permission: unknown) => typeof permission === "string")
    )
      throw new Error();
    const permissions = claims.permissions;
    if (!permissions.includes("room:join") || new Set(permissions).size !== permissions.length)
      throw new Error();
    const expiresAt = claims.exp * 1000;
    if (expiresAt <= Date.now())
      throw new RoomError("TOKEN_EXPIRED", "The participant token has expired");
    return {
      roomId: claims.roomId as string,
      participantId: claims.participantId as string,
      expiresAt,
      grant: JSON.stringify([
        claims.roomId,
        claims.participantId,
        claims.projectId,
        claims.environmentId,
        [...permissions].sort(),
      ]),
    };
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError(
      "INVALID_TOKEN",
      "Provide a valid participant JWT issued by your application server",
    );
  }
}
