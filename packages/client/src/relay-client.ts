import { RoomError } from "./room-errors.js";
import { RoomEventEmitter } from "./room-events.js";
import { RoomSession } from "./room-session.js";
import type {
  JoinOptions,
  RelayClientOptions,
  Room,
  RoomConnectionState,
  RoomEvents,
} from "./room.js";

export class RelayClient {
  readonly #options: RelayClientOptions;
  readonly #events = new RoomEventEmitter();
  #room: RoomSession | undefined;
  #state: RoomConnectionState = "disconnected";

  constructor(options: RelayClientOptions) {
    this.#events.on("connectionStateChanged", (state) => {
      this.#state = state;
    });
    try {
      const url = new URL(options.signalingUrl);
      if (
        !["ws:", "wss:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
      const timeout = options.requestTimeoutMs ?? 10_000;
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) throw new Error();
      if (options.iceTransportPolicy && !["all", "relay"].includes(options.iceTransportPolicy))
        throw new Error();
      this.#options = {
        ...options,
        signalingUrl: url.href,
        ...(options.iceServers ? { iceServers: structuredClone(options.iceServers) } : {}),
      };
    } catch {
      throw new RoomError(
        "INVALID_CONFIGURATION",
        "Provide a ws/wss signaling URL without credentials, query or fragment, and a timeout from 1 to 60000 milliseconds",
      );
    }
  }

  get currentRoom(): Room | undefined {
    return this.#room;
  }
  get connectionState(): RoomConnectionState {
    return this.#room?.connectionState ?? this.#state;
  }

  on<Event extends keyof RoomEvents>(
    event: Event,
    listener: (value: RoomEvents[Event]) => void,
  ): () => void {
    return this.#events.on(event, listener);
  }

  async join(token: string, options: JoinOptions = {}): Promise<Room> {
    if (this.#room)
      throw new RoomError("ALREADY_JOINED", "Leave the current room before joining another room");
    const scope = tokenScope(token);
    const room = new RoomSession(this.#options, this.#events, () => {
      if (this.#room === room) this.#room = undefined;
    });
    this.#room = room;
    await room.start(token, scope, options);
    return room;
  }

  async leave(): Promise<void> {
    await this.#room?.leave();
  }
}

function tokenScope(token: string): { roomId: string; participantId: string } {
  try {
    if (token.length > 8_192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))
      throw new Error();
    const encoded = token.split(".")[1];
    if (!encoded) throw new Error();
    const bytes = Uint8Array.from(atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/")), (value) =>
      value.charCodeAt(0),
    );
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      typeof claims !== "object" ||
      claims === null ||
      !("roomId" in claims) ||
      !("participantId" in claims) ||
      !("exp" in claims) ||
      typeof claims.roomId !== "string" ||
      typeof claims.participantId !== "string" ||
      !/^\S{1,128}$/u.test(claims.roomId) ||
      !/^\S{1,128}$/u.test(claims.participantId) ||
      typeof claims.exp !== "number" ||
      !Number.isSafeInteger(claims.exp)
    )
      throw new Error();
    if (claims.exp <= Date.now() / 1_000)
      throw new RoomError("TOKEN_EXPIRED", "The participant token has expired");
    return { roomId: claims.roomId, participantId: claims.participantId };
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError(
      "INVALID_TOKEN",
      "Provide a valid participant JWT issued by your application server",
    );
  }
}
