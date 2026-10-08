export type ApiKey = {
  id: string
  name: string
  preview: string
  environment: string
  createdAt: string
  lastUsed: string | null
  spend30d: number
  owner: string
}

export const initialApiKeys: ApiKey[] = [
  {
    id: 'key_1',
    name: 'Chat Playground',
    preview: 'rl-…N4qA',
    environment: 'production',
    createdAt: 'Oct 2, 2026',
    lastUsed: 'Oct 3, 2026',
    spend30d: 0,
    owner: 'Abdellah Ketoun',
  },
  {
    id: 'key_2',
    name: 'Staging server',
    preview: 'rl-…8fKz',
    environment: 'staging',
    createdAt: 'Oct 3, 2026',
    lastUsed: null,
    spend30d: 0,
    owner: 'Abdellah Ketoun',
  },
]
