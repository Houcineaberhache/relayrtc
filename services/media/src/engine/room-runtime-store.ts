import type { RelayKitDatabase } from "@relayrtc/database";
import { sql } from "drizzle-orm";

export interface RoomRuntimeStore {
  allocated(roomId: string, workerId: string): Promise<void>;
  failed(roomIds: readonly string[]): Promise<void>;
  recover(): Promise<void>;
}

export function createRoomRuntimeStore(
  database: RelayKitDatabase,
  nodeId: string,
): RoomRuntimeStore {
  const fail = async (roomIds?: readonly string[]) => {
    if (roomIds?.length === 0) return;
    await database.execute(sql`UPDATE room r SET status = 'failed', ended_at = coalesce(r.ended_at, now())
      FROM media_room_runtime m WHERE m.room_id = r.id AND m.node_id = ${nodeId}
      AND r.status IN ('created', 'active')
      ${
        roomIds
          ? sql`AND r.id IN (${sql.join(
              roomIds.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql``
      }`);
  };
  return {
    async allocated(roomId, workerId) {
      await database.transaction(async (transaction) => {
        const rows = await transaction.execute(sql`SELECT id FROM room WHERE id = ${roomId}
          AND status IN ('created', 'active') FOR SHARE`);
        if (rows.length !== 1) throw new Error("The room is not accepting media allocations");
        await transaction.execute(sql`INSERT INTO media_room_runtime (room_id, node_id, worker_id)
          VALUES (${roomId}, ${nodeId}, ${workerId}) ON CONFLICT (room_id) DO UPDATE
          SET node_id = EXCLUDED.node_id, worker_id = EXCLUDED.worker_id, allocated_at = now()`);
      });
    },
    failed: fail,
    recover: () => fail(),
  };
}
