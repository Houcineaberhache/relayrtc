import type { Environment, Organization, OrganizationMembership, Project } from "@relayrtc/types";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createOrganizationInputSchema,
  organizationMembershipSchema,
  organizationSchema,
  organizationSlugFromName,
  updateOrganizationInputSchema,
} from "./organization.js";
import { environmentSchema, projectSchema } from "./project.js";

const createdAt = "2026-10-01T00:00:00Z";

describe("organization schemas", () => {
  it("validates organization creation input", () => {
    expect(
      createOrganizationInputSchema.parse({
        name: "  RelayRTC Labs  ",
        slug: "relayrtc-labs",
      }),
    ).toEqual({ name: "RelayRTC Labs", slug: "relayrtc-labs" });
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
        slug: "acme-realtime",
      }),
    ).toEqual({
      organizationId: "organization_123",
      name: "Acme Realtime",
      slug: "acme-realtime",
    });
    expect(
      updateOrganizationInputSchema.safeParse({
        organizationId: "organization_123",
        name: "Acme",
        slug: "Acme Team",
      }).success,
    ).toBe(false);
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
        createdAt,
        updatedAt: createdAt,
      }).success,
    ).toBe(false);
  });
});
