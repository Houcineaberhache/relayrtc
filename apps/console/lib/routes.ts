export const routes = {
  login: '/auth/login',
  signup: '/auth/signup',
  onboarding: '/console/onboarding',
  org: (orgId: string) => `/org/${orgId}`,
  project: (orgId: string, projectId: string) => `/org/${orgId}/project/${projectId}`,
  projectPage: (orgId: string, projectId: string, page: string) => `/org/${orgId}/project/${projectId}/${page}`,
  projectSettings: (orgId: string, projectId: string, tab = 'general') => `/org/${orgId}/project/${projectId}/settings?tab=${tab}`,
  orgSettings: (orgId: string, tab = 'general') => `/org/${orgId}/settings?tab=${tab}`,
  invitation: (invitationId: string) => `/invitations/${invitationId}`,
}
