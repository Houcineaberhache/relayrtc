import type { Environment, Organization, OrganizationMembership, Project } from "@relayrtc/types";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createOrganizationInputSchema,
  inviteOrganizationMemberInputSchema,
  organizationMembershipSchema,
  organizationSchema,
  organizationSlugFromName,
  removeOrganizationMemberInputSchema,
  transferOrganizationOwnershipInputSchema,
  updateOrganizationMemberRoleInputSchema,
  updateOrganizationInputSchema,
} from "./organization.js";
import {
  createEnvironmentInputSchema,
  createProjectInputSchema,
  deleteEnvironmentInputSchema,
  deleteProjectInputSchema,
  environmentSchema,
  projectSchema,
  projectSlugFromName,
  updateEnvironmentInputSchema,
  updateProjectInputSchema,
} from "./project.js";

const createdAt = "2026-10-01T00:00:00Z";

describe("organization schemas", () => {
  it("validates organization creation input", () => {
    expect(
      createOrganizationInputSchema.parse({
        name: "  RelayRTC Labs  ",
      }),
    ).toEqual({ name: "RelayRTC Labs" });
    expect(createOrganizationInputSchema.safeParse({ name: "Labs", slug: "RelayRTC Labs" }).success)
      .toBe(false);
  });

  it("creates URL-safe organization slugs from names", () => {
    expect(organizationSlugFromName("  Café Video Team  ")).toBe("cafe-video-team");
  });

  it("validates organization settings updates", () => {
    expect(
      updateOrganizationInputSchema.parse({
        organizationId: "organization_123",
        name: "  Acme Realtime  ",
      }),
    ).toEqual({
      organizationId: "organization_123",
      name: "Acme Realtime",
    });
    expect(
      updateOrganizationInputSchema.safeParse({
        organizationId: "organization_123",
        name: "Acme",
        slug: "Acme Team",
      }).success,
    ).toBe(false);
  });

  it("validates organization invitations", () => {
    expect(
      inviteOrganizationMemberInputSchema.parse({
        email: "  DEVELOPER@example.com ",
        organizationId: "organization_123",
        role: "developer",
      }),
    ).toEqual({
      email: "developer@example.com",
      organizationId: "organization_123",
      role: "developer",
    });
    expect(
      inviteOrganizationMemberInputSchema.safeParse({
        email: "not-an-email",
        organizationId: "organization_123",
        role: "owner",
      }).success,
    ).toBe(false);
  });

  it("validates member role updates and removal", () => {
    expect(
      updateOrganizationMemberRoleInputSchema.parse({
        memberId: "membership_123",
        organizationId: "organization_123",
        role: "admin",
      }),
    ).toEqual({
      memberId: "membership_123",
      organizationId: "organization_123",
      role: "admin",
    });
    expect(
      updateOrganizationMemberRoleInputSchema.safeParse({
        memberId: "membership_123",
        organizationId: "organization_123",
        role: "superadmin",
      }).success,
    ).toBe(false);
    expect(
      removeOrganizationMemberInputSchema.parse({
        memberIdOrEmail: "membership_123",
        organizationId: "organization_123",
      }),
    ).toEqual({
      memberIdOrEmail: "membership_123",
      organizationId: "organization_123",
    });
    expect(
      transferOrganizationOwnershipInputSchema.parse({
        organizationId: "organization_123",
        targetMemberId: "membership_456",
      }),
    ).toEqual({
      organizationId: "organization_123",
      targetMemberId: "membership_456",
    });
  });

  it("parses organizations and memberships", () => {
    const organization = organizationSchema.parse({
      id: "org_123",
      name: "RelayRTC Labs",
      slug: "relayrtc-labs",
      createdAt,
      updatedAt: createdAt,
    });
    const membership = organizationMembershipSchema.parse({
      id: "membership_123",
      organizationId: organization.id,
      userId: "user_123",
      role: "owner",
      createdAt,
      updatedAt: createdAt,
    });

    expectTypeOf(organization).toEqualTypeOf<Organization>();
    expectTypeOf(membership).toEqualTypeOf<OrganizationMembership>();
  });

  it("rejects invalid roles, slugs, and unknown properties", () => {
    expect(
      organizationMembershipSchema.safeParse({
        id: "membership_123",
        organizationId: "org_123",
        userId: "user_123",
        role: "superadmin",
        createdAt,
        updatedAt: createdAt,
      }).success,
    ).toBe(false);
    expect(
      organizationSchema.safeParse({
        id: "org_123",
        name: "RelayRTC Labs",
        slug: "RelayRTC Labs",
        createdAt,
        updatedAt: createdAt,
        internal: true,
      }).success,
    ).toBe(false);
  });
});

describe("project schemas", () => {
  it("validates project management inputs", () => {
    expect(
      createProjectInputSchema.parse({
        name: "  Video Classroom  ",
        organizationId: "org_123",
      }),
    ).toEqual({
      name: "Video Classroom",
      organizationId: "org_123",
    });
    expect(projectSlugFromName(" Café Support App ")).toBe("cafe-support-app");
    expect(
      updateProjectInputSchema.safeParse({
        name: "Classroom",
        projectId: "project_123",
        slug: "Invalid Slug",
      }).success,
    ).toBe(false);
    expect(
      deleteProjectInputSchema.safeParse({
        confirmationName: "",
        projectId: "project_123",
      }).success,
    ).toBe(false);
  });

  it("validates environment settings input", () => {
    expect(
      updateEnvironmentInputSchema.parse({
        deletionProtected: true,
        environmentId: "environment_123",
        name: "Production",
        projectId: "project_123",
        slug: "production",
      }),
    ).toEqual({
      environmentId: "environment_123",
      deletionProtected: true,
      name: "Production",
      projectId: "project_123",
      slug: "production",
    });
    expect(
      updateEnvironmentInputSchema.safeParse({
        deletionProtected: false,
        environmentId: "environment_123",
        name: "Preview",
        projectId: "project_123",
        slug: "preview",
        type: "unknown",
      }).success,
    ).toBe(false);
    expect(
      createEnvironmentInputSchema.safeParse({
        deletionProtected: false,
        name: "Another production",
        projectId: "project_123",
        slug: "another-production",
        type: "production",
      }).success,
    ).toBe(false);
    expect(
      deleteEnvironmentInputSchema.safeParse({
        environmentId: "env_123",
        projectId: "project_123",
      }).success,
    ).toBe(true);
  });

  it("parses projects and environments", () => {
    const project = projectSchema.parse({
      id: "project_123",
      organizationId: "org_123",
      name: "Video Classroom",
      slug: "video-classroom",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });
    const environment = environmentSchema.parse({
      id: "environment_123",
      projectId: project.id,
      name: "Production",
      slug: "production",
      type: "production",
      deletionProtected: true,
      createdAt,
      updatedAt: createdAt,
    });

    expectTypeOf(project).toEqualTypeOf<Project>();
    expectTypeOf(environment).toEqualTypeOf<Environment>();
  });

  it("rejects unknown project and environment states", () => {
    expect(
      projectSchema.safeParse({
        id: "project_123",
        organizationId: "org_123",
        name: "Video Classroom",
        slug: "video-classroom",
        status: "archived",
        createdAt,
        updatedAt: createdAt,
      }).success,
    ).toBe(false);
    expect(
      environmentSchema.safeParse({
        id: "environment_123",
        projectId: "project_123",
        name: "Production",
        slug: "production",
        type: "live",
        deletionProtected: true,
        createdAt,
        updatedAt: createdAt,
      }).success,
    ).toBe(false);
  });
});
