import type { RelayKitDatabase } from "@relayrtc/database";
import {
  processRuntimeOperation,
  terminateRoomRuntime,
  type RuntimeOperationView,
} from "@relayrtc/auth";
import type { RoomRecord } from "./room.repository.js";

export interface RoomRuntimeService {
  end(room: RoomRecord): Promise<RuntimeOperationView | undefined>;
}

interface RoomRuntimeOptions {
  database?: RelayKitDatabase;
  internalSecret: string;
  mediaUrl: string;
  signalingUrl: string;
}

export const createRoomRuntimeService = (options: RoomRuntimeOptions): RoomRuntimeService => ({
  async end(room) {
    if (!options.database) {
      await terminateRoomRuntime({ ...room }, options);
      return undefined;
    }
    const operation = await processRuntimeOperation(
      options.database,
      options,
      `room.end:${room.id}`,
    );
    if (!operation) throw new Error("Room cleanup was not persisted");
    return operation;
  },
});
