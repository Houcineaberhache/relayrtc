import { enforceCredentialPolicy, readInternalSecret } from "@relayrtc/protocol/credential-policy";
import { schema, type RelayKitDatabase } from "@relayrtc/database";
import { terminateRoomRuntime } from "./runtime-operations.js";
import { and, count, eq, inArray, isNull, notInArray } from "drizzle-orm";

export interface ResourceDeletionImpact {
  projects: number;
  environments: number;
  apiKeys: number;
  rooms: number;
  roomsToEnd: number;
  connectedParticipants: number;
}

type DeletionScope =
  { organizationId: string; projectId?: never } | { projectId: string; organizationId?: never };

const emptyImpact = (): ResourceDeletionImpact => ({
  projects: 0,
  environments: 0,
  apiKeys: 0,
  rooms: 0,
  roomsToEnd: 0,
  connectedParticipants: 0,
});

export const getDeletionProjectIds = async (
  database: RelayKitDatabase,
  scope: DeletionScope,
): Promise<string[]> => {
  if (scope.projectId !== undefined) {
    const [project] = await database
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(eq(schema.project.id, scope.projectId));
    return project ? [project.id] : [];
  }

  const organizationId = scope.organizationId;
  const projects = await database
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(eq(schema.project.organizationId, organizationId));
  return projects.map((project) => project.id);
};

export const getResourceDeletionImpact = async (
  database: RelayKitDatabase,
  scope: DeletionScope,
): Promise<ResourceDeletionImpact> => {
  const projectIds = await getDeletionProjectIds(database, scope);
  if (projectIds.length === 0) return emptyImpact();

  const projectRoom = inArray(schema.room.projectId, projectIds);
  const [environments, apiKeys, rooms, roomsToEnd, participants] = await Promise.all([
    database
      .select({ value: count() })
      .from(schema.environment)
      .where(inArray(schema.environment.projectId, projectIds)),
    database
      .select({ value: count() })
      .from(schema.apiKey)
      .where(inArray(schema.apiKey.projectId, projectIds)),
    database.select({ value: count() }).from(schema.room).where(projectRoom),
    database
      .select({ value: count() })
      .from(schema.room)
      .where(and(projectRoom, notInArray(schema.room.status, ["ended", "failed"]))),
    database
      .select({ value: count() })
      .from(schema.participant)
      .innerJoin(schema.room, eq(schema.participant.roomId, schema.room.id))
      .where(and(inArray(schema.room.projectId, projectIds), isNull(schema.participant.leftAt))),
  ]);

  return {
    projects: projectIds.length,
    environments: environments[0]?.value ?? 0,
    apiKeys: apiKeys[0]?.value ?? 0,
    rooms: rooms[0]?.value ?? 0,
    roomsToEnd: roomsToEnd[0]?.value ?? 0,
    connectedParticipants: participants[0]?.value ?? 0,
  };
};

export interface RoomTerminationConfig {
  internalSecret: string;
  mediaUrl: string;
  signalingUrl: string;
}

export const readRoomTerminationConfig = (
  source: Record<string, string | undefined>,
): RoomTerminationConfig => {
  enforceCredentialPolicy(source, [
    "RELAYRTC_INTERNAL_SECRET",
    "RELAYRTC_MEDIA_INTERNAL_URL",
    "RELAYRTC_SIGNALING_INTERNAL_URL",
  ]);
  const internalSecret = readInternalSecret(source);
  return {
    internalSecret,
    mediaUrl: source.RELAYRTC_MEDIA_INTERNAL_URL ?? "http://media:8082/internal/v1",
    signalingUrl: source.RELAYRTC_SIGNALING_INTERNAL_URL ?? "http://signaling:8081/internal/v1",
  };
};

export const terminateResourceRooms = async (
  database: RelayKitDatabase,
  projectIds: readonly string[],
  config: RoomTerminationConfig,
): Promise<void> => {
  if (projectIds.length === 0) return;
  const rooms = await database
    .select()
    .from(schema.room)
    .where(inArray(schema.room.projectId, [...projectIds]));
  for (const room of rooms) {
    const endedAt = room.endedAt ?? new Date();
    await database
      .update(schema.room)
      .set({ status: "ended", endedAt })
      .where(eq(schema.room.id, room.id));
    await terminateRoomRuntime(
      { ...room, status: "ended", endedAt },
      { ...config, service: "relayrtc-console" },
    );
  }
};
