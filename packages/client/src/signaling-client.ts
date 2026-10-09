import {
  protocolMessageSchema,
  protocolRequestTypes,
  protocolEventTypes,
  type ClientProtocolMessage,
  type ProtocolResponseMessage,
  type ServerProtocolMessage,
} from "@relayrtc/protocol";
import { RoomError, type RoomErrorCode } from "./room-errors.js";
import { signalingFrameLimit } from "./room-json.js";

const serverErrorCodes = {
  unauthorized: "AUTHENTICATION_FAILED",
  forbidden: "PERMISSION_DENIED",
  not_found: "RESOURCE_NOT_FOUND",
  conflict: "SESSION_CONFLICT",
  rate_limited: "RATE_LIMITED",
  temporarily_unavailable: "SERVICE_UNAVAILABLE",
  internal_error: "SERVICE_UNAVAILABLE",
  invalid_message: "PROTOCOL_ERROR",
  unsupported_version: "PROTOCOL_ERROR",
} as const satisfies Record<string, RoomErrorCode>;

interface PendingRequest {
  readonly operation: ClientProtocolMessage["type"];
  readonly expected: ProtocolResponseMessage["type"];
  readonly resolve: (message: ProtocolResponseMessage) => void;
  readonly reject: (error: RoomError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

type ResponsePayloads = {
  [Type in ProtocolResponseMessage["type"]]: Extract<
    ProtocolResponseMessage,
    { type: Type }
  >["payload"];
};

export class SignalingClient {
  readonly #pending = new Map<string, PendingRequest>();
  #socket: WebSocket | undefined;
  #opening: { resolve: () => void; reject: (error: RoomError) => void } | undefined;
  #openTimer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #disposed = false;
  #heartbeat: ReturnType<typeof setInterval> | undefined;

  get connected(): boolean {
    return !this.#closed && this.#socket?.readyState === 1;
  }

  constructor(
    readonly url: string,
    readonly timeoutMs: number,
    readonly onMessage: (message: ServerProtocolMessage) => void,
    readonly onFailure: (error: RoomError) => void,
  ) {}

  connect(token: string): Promise<void> {
    if (this.#disposed)
      return Promise.reject(new RoomError("NOT_CONNECTED", "The signaling client has closed"));
    if (this.#socket)
      return Promise.reject(
        new RoomError("SESSION_CONFLICT", "A signaling connection is already active"),
      );
    this.#closed = false;
    return new Promise((resolve, reject) => {
      this.#opening = { resolve, reject };
      this.#openTimer = setTimeout(() => {
        this.#fail(new RoomError("REQUEST_TIMEOUT", "The signaling connection timed out", true));
      }, this.timeoutMs);
      try {
        const socket = new WebSocket(this.url, ["relayrtc.v1", `relayrtc.token.${token}`]);
        this.#socket = socket;
        socket.addEventListener("open", this.#onOpen);
        socket.addEventListener("message", this.#onMessage);
        socket.addEventListener("error", this.#onError);
        socket.addEventListener("close", this.#onClose);
      } catch {
        this.#fail(
          new RoomError("CONNECTION_FAILED", "The signaling connection could not be opened", true),
        );
      }
    });
  }

  async request<Type extends ProtocolResponseMessage["type"]>(
    type: ClientProtocolMessage["type"],
    payload: unknown,
    expected: Type,
  ): Promise<ResponsePayloads[Type]> {
    const socket = this.#socket;
    if (this.#closed || socket?.readyState !== 1) {
      throw new RoomError("NOT_CONNECTED", "The signaling connection is unavailable");
    }
    const id = crypto.randomUUID();
    const request = protocolMessageSchema.safeParse({
      v: 1,
      id,
      sentAt: new Date().toISOString(),
      type,
      payload,
    });
    if (!request.success)
      throw new RoomError("INVALID_PAYLOAD", "The signaling request payload is invalid");
    const encoded = JSON.stringify(request.data);
    if (new TextEncoder().encode(encoded).byteLength > signalingFrameLimit)
      throw new RoomError(
        "PAYLOAD_TOO_LARGE",
        "Signaling messages must fit within 65536 UTF-8 bytes including their envelope",
      );
    const message = await new Promise<ProtocolResponseMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new RoomError("REQUEST_TIMEOUT", "The signaling request timed out", true));
      }, this.timeoutMs);
      this.#pending.set(id, { operation: type, expected, resolve, reject, timer });
      try {
        socket.send(encoded);
      } catch {
        clearTimeout(timer);
        this.#pending.delete(id);
        const error = new RoomError(
          "CONNECTION_FAILED",
          "The signaling request could not be sent",
          true,
        );
        reject(error);
        this.#fail(error);
      }
    });
    return message.payload as ResponsePayloads[Type];
  }

  close(error = new RoomError("CONNECTION_CLOSED", "The signaling connection was closed")): void {
    this.#disposed = true;
    this.disconnect(error);
  }

  disconnect(
    error = new RoomError("CONNECTION_CLOSED", "The signaling connection was interrupted", true),
  ): void {
    this.#closed = true;
    clearInterval(this.#heartbeat);
    this.#heartbeat = undefined;
    clearTimeout(this.#openTimer);
    this.#opening?.reject(error);
    this.#opening = undefined;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket) {
      socket.removeEventListener("open", this.#onOpen);
      socket.removeEventListener("message", this.#onMessage);
      socket.removeEventListener("error", this.#onError);
      socket.removeEventListener("close", this.#onClose);
      if (socket.readyState < 2) socket.close(1000, "client closed");
    }
  }

  #fail(error: RoomError): void {
    if (this.#closed) return;
    this.disconnect(error);
    this.onFailure(error);
  }

  readonly #onOpen = (event: Event): void => {
    if (event.currentTarget !== this.#socket) return;
    if (this.#socket.protocol !== "relayrtc.v1") {
      this.#fail(
        new RoomError("PROTOCOL_ERROR", "The server did not negotiate RelayRTC protocol v1"),
      );
      return;
    }
    clearTimeout(this.#openTimer);
    this.#opening?.resolve();
    this.#opening = undefined;
    const socket = this.#socket;
    let pinging = false;
    this.#heartbeat = setInterval(() => {
      if (pinging || socket !== this.#socket || !this.connected) return;
      pinging = true;
      const nonce = crypto.randomUUID();
      void this.request("heartbeat.ping", { nonce }, "heartbeat.pong")
        .then((response) => {
          if (response.nonce !== nonce && socket === this.#socket)
            this.#fail(
              new RoomError("PROTOCOL_ERROR", "The heartbeat response does not match the request"),
            );
        })
        .catch((error: unknown) => {
          if (socket === this.#socket)
            this.#fail(
              error instanceof RoomError
                ? error
                : new RoomError("CONNECTION_FAILED", "The signaling heartbeat failed", true),
            );
        })
        .finally(() => {
          pinging = false;
        });
    }, 5000);
  };

  readonly #onError = (event: Event): void => {
    if (event.currentTarget !== this.#socket) return;
    this.#fail(new RoomError("CONNECTION_FAILED", "The signaling connection failed", true));
  };

  readonly #onClose = (event: CloseEvent): void => {
    if (event.currentTarget !== this.#socket) return;
    const code =
      event.code === 4001
        ? "TOKEN_EXPIRED"
        : event.code === 4002
          ? "ROOM_ENDED"
          : event.code === 4003
            ? "RTC_STATE_CHANGED"
            : event.code === 4005
              ? "CREDENTIALS_REVOKED"
              : event.code === 4004
                ? "PARTICIPANT_REMOVED"
                : event.code === 1008
                  ? "POLICY_VIOLATION"
                  : "CONNECTION_CLOSED";
    this.#fail(
      new RoomError(
        code,
        "The signaling connection was closed by the server",
        code === "CONNECTION_CLOSED" || code === "RTC_STATE_CHANGED",
      ),
    );
  };

  readonly #onMessage = (event: MessageEvent<unknown>): void => {
    if (event.currentTarget !== this.#socket) return;
    let input: unknown;
    try {
      if (typeof event.data !== "string" || event.data.length > 1_048_576) throw new Error();
      input = JSON.parse(event.data);
    } catch {
      this.#fail(new RoomError("PROTOCOL_ERROR", "The server sent an invalid signaling message"));
      return;
    }
    let parsed: ReturnType<typeof protocolMessageSchema.safeParse>;
    try {
      parsed = protocolMessageSchema.safeParse(input);
    } catch {
      this.#fail(new RoomError("PROTOCOL_ERROR", "The server sent an invalid signaling payload"));
      return;
    }
    if (!parsed.success || protocolRequestTypes.some((type) => type === parsed.data.type)) {
      this.#fail(new RoomError("PROTOCOL_ERROR", "The server sent an invalid signaling message"));
      return;
    }
    const message = parsed.data as ServerProtocolMessage;
    if (protocolEventTypes.some((type) => type === message.type)) {
      this.onMessage(message);
      return;
    }
    if ("requestId" in message && message.requestId) {
      const pending = this.#pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.requestId);
      if (message.type === "protocol.error") {
        pending.reject(
          new RoomError(
            serverErrorCodes[message.payload.code],
            `The server rejected ${pending.operation}`,
            message.payload.retryable,
            message.payload.code,
          ),
        );
      } else if (message.type !== pending.expected) {
        pending.reject(
          new RoomError("PROTOCOL_ERROR", "The server returned an unexpected response"),
        );
      } else {
        pending.resolve(message);
      }
      return;
    }
    if (message.type === "protocol.error") {
      this.#fail(
        new RoomError(
          serverErrorCodes[message.payload.code],
          "The server rejected the signaling connection",
          message.payload.retryable,
          message.payload.code,
        ),
      );
      return;
    }
    this.onMessage(message);
  };
}
