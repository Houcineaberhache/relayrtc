import type { RelayKitDatabase } from "@relayrtc/database";
import { sql } from "drizzle-orm";
import { ApiError } from "../../http/errors/api-error.js";
import type { TurnCredentialIssuer, TurnCredentialScope } from "./turn-credential.service.js";

export function createRetainedTurnCredentialIssuer(
  database: RelayKitDatabase,
  issuer: TurnCredentialIssuer,
): TurnCredentialIssuer {
  return {
    async issue(scope: TurnCredentialScope) {
      return database.transaction(async (transaction) => {
        const [project] = await transaction.execute(sql`
          select p.organization_id from project p join environment e on e.project_id = p.id
          where p.id = ${scope.projectId} and e.id = ${scope.environmentId}
            and p.status = 'active' and e.status = 'active' for share of p, e
        `);
        if (!project) throw new ApiError(403, "FORBIDDEN", "The TURN credential scope is inactive");
        let participantId: string | null = null;
        if (scope.roomId || scope.sessionId) {
          if (!scope.roomId || !scope.sessionId)
            throw new ApiError(400, "INVALID_REQUEST", "Provide roomId and sessionId together");
          const [session] = await transaction.execute(sql`
            select p.id from participant_session s join participant p on p.id = s.participant_id
            join room r on r.id = p.room_id
            where s.id = ${scope.sessionId} and r.id = ${scope.roomId}
              and r.project_id = ${scope.projectId} and r.environment_id = ${scope.environmentId}
              and r.status = 'active' and p.left_at is null and p.removed_at is null
              and s.connection_state in ('connected', 'reconnecting') for share of s, p, r
          `);
          if (!session)
            throw new ApiError(
              404,
              "NOT_FOUND",
              "The participant session is unavailable in this scope",
            );
          participantId = String(session.id);
        }
        const credentials = await issuer.issue(scope);
        await transaction.execute(sql`
          insert into turn_credential (username, organization_id, project_id, environment_id, room_id, session_id, participant_id, issued_at, expires_at)
          values (${credentials.username}, ${String(project.organization_id)}, ${scope.projectId}, ${scope.environmentId},
            ${scope.roomId ?? null}, ${scope.sessionId ?? null}, ${participantId}, now(), ${credentials.expiresAt}::timestamptz)
        `);
        return credentials;
      });
    },
  };
}
