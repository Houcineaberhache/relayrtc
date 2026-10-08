export type Organization = {
  id: string
  name: string
  uuid: string
  createdAt: string
  plan: 'Community' | 'Cloud Pro'
}

export type Project = {
  id: string
  name: string
  description: string
  createdAt: string
}

export type EnvironmentType = 'staging' | 'preview' | 'custom'

export type Environment = {
  id: string
  name: string
  slug: string
  type: EnvironmentType
  protected: boolean
  createdAt: string
}

export type Role = 'owner' | 'admin' | 'developer' | 'viewer'

export type Member = {
  id: string
  name: string
  email: string
  role: Role
  joinedAt: string
}

export type Invitation = {
  id: string
  email: string
  role: Exclude<Role, 'owner'>
  invitedAt: string
  invitedBy: string
}

export const currentUser = {
  name: 'Abdellah Ketoun',
  firstName: 'Abdellah',
  email: 'ketounabdellahoff@gmail.com',
}

export const organizations: Organization[] = [
  {
    id: 'abdellah-org',
    name: "Abdellah's org",
    uuid: 'a87e8d74-653a-42d7-bea7-6748f88b8934',
    createdAt: 'Oct 2, 2026',
    plan: 'Community',
  },
  {
    id: 'relayr-labs',
    name: 'Relayr Labs',
    uuid: '3c1f9b0e-72aa-4d8e-9a55-0b6a1d2c4e71',
    createdAt: 'Sep 14, 2026',
    plan: 'Cloud Pro',
  },
]

const projectsByOrg: Record<string, Project[]> = {
  'abdellah-org': [
    {
      id: 'chat-playground',
      name: 'Chat Playground',
      description: 'Group rooms and realtime messaging sandbox.',
      createdAt: 'Oct 2, 2026',
    },
    {
      id: 'videochat',
      name: 'Videochat',
      description: '1:1 and group video calls for the web app.',
      createdAt: 'Oct 2, 2026',
    },
    {
      id: 'warble-chat',
      name: 'Warble Chat',
      description: 'Voice rooms with presence and moderation.',
      createdAt: 'Oct 3, 2026',
    },
  ],
  'relayr-labs': [
    {
      id: 'live-classroom',
      name: 'Live Classroom',
      description: 'Interactive classrooms with screen sharing.',
      createdAt: 'Sep 14, 2026',
    },
  ],
}

export const environments: Environment[] = [
  {
    id: 'env_daf39e51583d4baf',
    name: 'Production',
    slug: 'production',
    type: 'custom',
    protected: true,
    createdAt: 'Oct 2, 2026',
  },
  {
    id: 'env_7b21c04e9a3d58f1',
    name: 'Staging',
    slug: 'staging',
    type: 'staging',
    protected: false,
    createdAt: 'Oct 2, 2026',
  },
  {
    id: 'env_a94e0c5d21b67f38',
    name: 'Preview',
    slug: 'preview',
    type: 'preview',
    protected: false,
    createdAt: 'Oct 3, 2026',
  },
  {
    id: 'env_5c88d2f1e04a9b76',
    name: 'Development',
    slug: 'dev',
    type: 'custom',
    protected: false,
    createdAt: 'Oct 2, 2026',
  },
]

export const members: Member[] = [
  {
    id: 'usr_1',
    name: 'Abdellah Ketoun',
    email: 'ketounabdellahoff@gmail.com',
    role: 'owner',
    joinedAt: 'Oct 2, 2026',
  },
  {
    id: 'usr_2',
    name: 'Sara Benali',
    email: 'sara@relayrtc.dev',
    role: 'admin',
    joinedAt: 'Oct 2, 2026',
  },
  {
    id: 'usr_3',
    name: 'Yanis Haddad',
    email: 'yanis@relayrtc.dev',
    role: 'developer',
    joinedAt: 'Oct 3, 2026',
  },
  {
    id: 'usr_4',
    name: 'Lina Moreau',
    email: 'lina@relayrtc.dev',
    role: 'viewer',
    joinedAt: 'Oct 3, 2026',
  },
]

export const invitations: Invitation[] = [
  {
    id: 'inv_1',
    email: 'karim@example.com',
    role: 'developer',
    invitedAt: 'Oct 3, 2026',
    invitedBy: 'Abdellah Ketoun',
  },
]

export const teams = [
  { id: 'team_1', name: 'Platform', members: 3, createdAt: 'Oct 2, 2026' },
  { id: 'team_2', name: 'Mobile', members: 2, createdAt: 'Oct 3, 2026' },
]

export function humanize(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getOrganizations() {
  return organizations
}

export function getOrganization(orgId: string): Organization {
  const found = organizations.find((org) => org.id === orgId)
  if (found) return found
  return {
    id: orgId,
    name: humanize(orgId) || 'Organization',
    uuid: '5e0b7d1a-9c3f-4a62-8d14-2f7a6b3c9e05',
    createdAt: 'Oct 4, 2026',
    plan: 'Community',
  }
}

export function getProjects(orgId: string): Project[] {
  return (
    projectsByOrg[orgId] ?? [
      {
        id: 'chat-playground',
        name: 'Chat Playground',
        description: 'Your first RelayRTC project.',
        createdAt: 'Oct 4, 2026',
      },
    ]
  )
}

export function getProject(orgId: string, projectId: string): Project {
  const found = getProjects(orgId).find((project) => project.id === projectId)
  if (found) return found
  return {
    id: projectId,
    name: humanize(projectId) || 'Project',
    description: 'A RelayRTC project.',
    createdAt: 'Oct 4, 2026',
  }
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
