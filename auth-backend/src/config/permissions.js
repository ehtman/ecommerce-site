
export const PERMISSIONS = {
  PROFILE_READ: "profile:read",
  PROFILE_UPDATE: "profile:update",

  USERS_READ: "users:read",
  USERS_DELETE: "users:delete",

  REPORTS_READ: "reports:read",

  ROLES_MANAGE: "roles:manage",
};

export const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),

  manager: [
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.PROFILE_UPDATE,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.REPORTS_READ,
  ],

  user: [
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.PROFILE_UPDATE,
  ],
};
