import type { EnvironmentId, IsoDateTime, OrganizationId, ProjectId } from "./common.js";

export const projectStatuses = ["active", "suspended", "deleting", "deleted"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const environmentTypes = [
  "development",
  "production",
  "preview",
  "staging",
  "custom",
] as const;

export type EnvironmentType = (typeof environmentTypes)[number];

export interface Project {
  readonly id: ProjectId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly status: ProjectStatus;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface Environment {
  readonly id: EnvironmentId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly slug: string;
  readonly type: EnvironmentType;
  readonly deletionProtected: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}
