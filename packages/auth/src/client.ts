import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

import { organizationRoles } from "./organization.js";

export const createRelayKitAuthClient = (baseURL?: string) =>
  createAuthClient({
    ...(baseURL ? { baseURL } : {}),
    plugins: [
      organizationClient({
        roles: organizationRoles,
      }),
    ],
  });

export type RelayKitAuthClient = ReturnType<typeof createRelayKitAuthClient>;
