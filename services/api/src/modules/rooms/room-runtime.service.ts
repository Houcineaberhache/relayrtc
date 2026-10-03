import type { RoomRecord } from "./room.repository.js";

export interface RoomRuntimeService {
  end(room: RoomRecord): Promise<void>;
}

interface RoomRuntimeOptions {
  internalSecret: string;
  mediaUrl: string;
  signalingUrl: string;
}

const runtimeRequest = async (url: string, init: RequestInit): Promise<void> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Room runtime request failed with HTTP ${response.status}`);
  }
};

export const createRoomRuntimeService = (options: RoomRuntimeOptions): RoomRuntimeService => ({
  async end(room) {
    const roomId = encodeURIComponent(room.id);
    const results = await Promise.allSettled([
      runtimeRequest(`${options.signalingUrl}/rooms/${roomId}/end`, {
        body: JSON.stringify(room),
        headers: {
          authorization: `Bearer ${options.internalSecret}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
      runtimeRequest(`${options.mediaUrl}/rooms/${roomId}`, {
        headers: { authorization: `Bearer ${options.internalSecret}` },
        method: "DELETE",
      }),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  },
});
