import type { ConnectionQuality, ConnectionQualityEvent } from "@relayrtc/types";
import type { ServerProtocolMessage } from "@relayrtc/protocol";
import type { RoomRtc } from "./room-rtc.js";
import type { RtcQualityStats } from "./quality.js";
import type { RoomEvents } from "./room.js";
import { RoomError } from "./room-errors.js";

export class RoomQuality {
  readonly #events = new Set<string>();
  readonly #latest = new Map<string, ConnectionQualityEvent>();
  #quality: ConnectionQuality | null = null;
  #stats: RtcQualityStats | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #polling = false;
  #closed = false;
  constructor(
    readonly rtc: RoomRtc,
    readonly scope: () => { roomId: string; participantId: string; sessionId: string } | undefined,
    readonly active: () => boolean,
    readonly emit: <Event extends keyof RoomEvents>(event: Event, value: RoomEvents[Event]) => void,
  ) {}
  get quality(): ConnectionQuality | null {
    return this.#quality;
  }
  get stats(): RtcQualityStats | null {
    return this.#stats;
  }
  get participants(): ReadonlyMap<string, ConnectionQualityEvent> {
    return new Map(this.#latest);
  }
  start(): void {
    if (this.#closed || this.#timer) return;
    this.#timer = setInterval(() => {
      void this.#poll();
    }, 2000);
    void this.#poll();
  }
  async #poll(): Promise<void> {
    if (this.#polling || !this.#isActive()) return;
    this.#polling = true;
    try {
      const stats = await this.rtc.getQualityStats();
      if (!this.#isActive()) return;
      this.#stats = stats;
      this.emit("qualityStatsUpdated", stats);
      await this.rtc.reportQualityStats(stats);
    } catch (error) {
      if (this.#isActive())
        this.emit(
          "error",
          error instanceof RoomError
            ? error
            : new RoomError("QUALITY_STATS_FAILED", "RTC quality stats are unavailable"),
        );
    } finally {
      this.#polling = false;
    }
  }
  #isActive(): boolean {
    return !this.#closed && this.active();
  }
  handle(message: ServerProtocolMessage): void {
    const scope = this.scope();
    if (message.type === "participant.left" && message.payload.roomId === scope?.roomId) {
      this.#latest.delete(message.payload.participantId);
      return;
    }
    if (
      !scope ||
      (message.type !== "connection.quality.changed" &&
        message.type !== "connection.degraded" &&
        message.type !== "connection.recovered")
    )
      return;
    const event = message.payload;
    if (
      event.roomId !== scope.roomId ||
      (event.participantId === scope.participantId &&
        event.sessionId &&
        event.sessionId !== scope.sessionId)
    )
      return;
    const id = event.eventId ?? message.id;
    if (this.#events.has(id)) return;
    const previous = this.#latest.get(event.participantId);
    if (previous && Date.parse(previous.occurredAt) > Date.parse(event.occurredAt)) return;
    this.#events.add(id);
    if (this.#events.size > 4096) {
      const oldest = this.#events.values().next().value;
      if (oldest) this.#events.delete(oldest);
    }
    if (this.#latest.size >= 4096 && !this.#latest.has(event.participantId)) {
      const oldest = this.#latest.keys().next().value;
      if (oldest) this.#latest.delete(oldest);
    }
    this.#latest.set(event.participantId, event);
    if (event.participantId === scope.participantId && !this.active()) return;
    const old = event.participantId === scope.participantId ? this.#quality : previous?.quality;
    if (event.participantId === scope.participantId) this.#quality = event.quality;
    if (old !== event.quality) this.#transition(event, old ?? undefined);
  }
  lost(): void {
    const scope = this.scope();
    if (!scope || this.#closed || this.#quality === "lost") return;
    const previous = this.#quality;
    this.#quality = "lost";
    this.#stats = null;
    const event = {
      roomId: scope.roomId,
      participantId: scope.participantId,
      sessionId: scope.sessionId,
      previousQuality: previous ?? "lost",
      source: "connectivity",
      quality: "lost",
      occurredAt: new Date().toISOString(),
    } as ConnectionQualityEvent;
    this.#transition(event, previous ?? undefined);
  }

  reconcile(participantIds: readonly string[]): void {
    const active = new Set(participantIds);
    for (const id of this.#latest.keys()) if (!active.has(id)) this.#latest.delete(id);
  }
  #transition(event: ConnectionQualityEvent, previous?: ConnectionQuality): void {
    this.emit("connectionQualityChanged", event);
    if (!previous) return;
    const healthy = (quality: ConnectionQuality): boolean =>
      quality === "excellent" || quality === "good";
    if (healthy(previous) && !healthy(event.quality)) this.emit("connectionDegraded", event);
    if (!healthy(previous) && healthy(event.quality)) this.emit("connectionRecovered", event);
  }
  dispose(): void {
    this.#closed = true;
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#events.clear();
    this.#latest.clear();
  }
}
