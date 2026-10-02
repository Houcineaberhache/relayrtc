import { describe, expect, it } from "vitest";

import { buildOrganizationInvitationEmail } from "./invitation-email.js";

describe("organization invitation email", () => {
  it("builds an invitation message with the dashboard URL", () => {
    expect(
      buildOrganizationInvitationEmail("https://app.relayrtc.com", {
        email: "developer@example.com",
        id: "invitation/123",
        inviter: {
          user: {
            email: "owner@example.com",
            name: "Owner",
          },
        },
        organization: { name: "Acme Realtime" },
        role: "developer",
      }),
    ).toEqual({
      html: '<p>Owner invited you to join <strong>Acme Realtime</strong> as developer.</p><p><a href="https://app.relayrtc.com/invitations/invitation%2F123">Review invitation</a></p>',
      subject: "Join Acme Realtime on RelayRTC",
      text: "Owner invited you to join Acme Realtime as developer. Review the invitation: https://app.relayrtc.com/invitations/invitation%2F123",
      to: "developer@example.com",
    });
  });

  it("escapes user-controlled HTML content", () => {
    const email = buildOrganizationInvitationEmail("https://app.relayrtc.com", {
      email: "developer@example.com",
      id: "invitation_123",
      inviter: {
        user: {
          email: "owner@example.com",
          name: "<Owner>",
        },
      },
      organization: { name: "Acme & Co" },
      role: "developer",
    });

    expect(email.html).toContain("&lt;Owner&gt;");
    expect(email.html).toContain("Acme &amp; Co");
  });
});
