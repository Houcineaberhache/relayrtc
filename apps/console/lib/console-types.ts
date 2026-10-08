export interface ConsoleOrganization {
  id: string
  name: string
  slug: string
  logo: string | null | undefined
  createdAt: Date | string | undefined
}

export interface ConsoleProject {
  id: string
  organizationId: string
  name: string
  slug: string
  status: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ConsoleEnvironment {
  id: string
  projectId: string
  name: string
  slug: string
  type: string
  deletionProtected: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ConsoleUser {
  id: string
  name: string
  email: string
  image: string | null | undefined
}

export interface ConsoleOrganizationMember {
  id: string
  userId: string
  role: string
  createdAt: Date | string
  user: {
    id: string
    name: string
    email: string
    image: string | null | undefined
  }
}

export interface ConsoleInvitation {
  id: string
  email: string
  role: string
  expiresAt: Date | string
}
