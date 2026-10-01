import {
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const organizationRoles = {
  admin: adminAc,
  developer: memberAc,
  owner: ownerAc,
  viewer: memberAc,
};
