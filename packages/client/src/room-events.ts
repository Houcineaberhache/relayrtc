import type { RoomEvents } from "./room.js";

export class RoomEventEmitter {
  readonly #listeners: {
    [Event in keyof RoomEvents]: Set<(value: RoomEvents[Event]) => void>;
  } = { connectionStateChanged: new Set(), error: new Set() };

  on<Event extends keyof RoomEvents>(
    event: Event,
    listener: (value: RoomEvents[Event]) => void,
  ): () => void {
    this.#listeners[event].add(listener);
    return () => {
      this.#listeners[event].delete(listener);
    };
  }

  emit<Event extends keyof RoomEvents>(event: Event, value: RoomEvents[Event]): void {
    for (const listener of [...this.#listeners[event]]) {
      try {
        listener(value);
      } catch {
        continue;
      }
    }
  }

  clear(): void {
    this.#listeners.connectionStateChanged.clear();
    this.#listeners.error.clear();
  }
}
