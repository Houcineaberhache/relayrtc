import type { Role } from '@/lib/mock-data'

export type PermissionKey =
  | 'api-keys'
  | 'environments'
  | 'billing'
  | 'domains'
  | 'audit'
  | 'observability'
  | 'members'
  | 'settings'

export const permissionLabels: Record<PermissionKey, string> = {
  'api-keys': 'API keys',
  environments: 'Environments',
  billing: 'Billing',
  domains: 'Domains',
  audit: 'Audit log',
  observability: 'Observability',
  members: 'Members',
  settings: 'Settings',
}

export const permissionOrder = Object.keys(permissionLabels) as PermissionKey[]

export const roleMeta: Record<
  Role,
  { label: string; description: string; permissions: PermissionKey[] }
> = {
  owner: {
    label: 'Owner',
    description: 'Full control, including billing and ownership transfer.',
    permissions: permissionOrder,
  },
  admin: {
    label: 'Admin',
    description: 'Manage members, projects, environments and API keys.',
    permissions: ['api-keys', 'environments', 'domains', 'audit', 'observability', 'members', 'settings'],
  },
  developer: {
    label: 'Developer',
    description: 'Create API keys, manage environments and read observability data.',
    permissions: ['api-keys', 'environments', 'observability'],
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to usage, analytics and logs.',
    permissions: ['observability'],
  },
}

export const assignableRoles: Exclude<Role, 'owner'>[] = ['admin', 'developer', 'viewer']
