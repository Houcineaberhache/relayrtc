import { Resend } from "resend";

export interface OrganizationInvitationEmailDetails {
  email: string;
  id: string;
  inviter: {
    user: {
      email: string;
      name: string;
    };
  };
  organization: {
    name: string;
  };
  role: string;
}

export type OrganizationInvitationSender = (
  details: OrganizationInvitationEmailDetails,
) => Promise<void>;

export interface ResendInvitationSenderOptions {
  apiKey: string;
  baseUrl: string;
  from: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const buildOrganizationInvitationEmail = (
  baseUrl: string,
  details: OrganizationInvitationEmailDetails,
) => {
  const invitationUrl = new URL(
    `/invitations/${encodeURIComponent(details.id)}`,
    baseUrl,
  ).toString();
  const organizationName = escapeHtml(details.organization.name);
  const inviterName = escapeHtml(details.inviter.user.name);
  const role = escapeHtml(details.role);

  return {
    html: `<p>${inviterName} invited you to join <strong>${organizationName}</strong> as ${role}.</p><p><a href="${invitationUrl}">Review invitation</a></p>`,
    subject: `Join ${details.organization.name} on RelayRTC`,
    text: `${details.inviter.user.name} invited you to join ${details.organization.name} as ${details.role}. Review the invitation: ${invitationUrl}`,
    to: details.email,
  };
};

export const createResendInvitationSender = (
  options: ResendInvitationSenderOptions,
): OrganizationInvitationSender => {
  const resend = new Resend(options.apiKey);

  return async (details) => {
    const email = buildOrganizationInvitationEmail(options.baseUrl, details);
    const result = await resend.emails.send({
      ...email,
      from: options.from,
    });

    if (result.error) {
      throw new Error("Failed to send organization invitation");
    }
  };
};
