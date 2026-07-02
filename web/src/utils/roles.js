export const ROLES = {
  GUEST: 'GUEST',
  CUSTOMER: 'CUSTOMER',
  EMPLOYEE: 'EMPLOYEE',
  MANAGEMENT: 'MANAGEMENT',
  ADMIN: 'ADMIN',
  DELIVERY_DRIVER: 'DELIVERY_DRIVER',
  VIP: 'VIP',
  // Platform operator: gates cross-tenant management (tenant provisioning).
  SUPER_ADMIN: 'SUPER_ADMIN',
};

export const GUEST_USER = { id: 999, email: 'guest@guest.com', roles: [ROLES.GUEST], name: 'Guest' };

export const isGuest = (user) => user?.email === 'guest@guest.com';

export const getUserRoles = (user) => {
  if (!user) return [];
  if (Array.isArray(user.roles)) return user.roles;
  if (user.role) return [user.role];
  return [];
};

export const hasRole = (user, role) => {
  const roles = getUserRoles(user);
  return roles.includes(role);
};

export const hasAnyRole = (user, roles) => {
  const userRoles = getUserRoles(user);
  return roles.some((role) => userRoles.includes(role));
};

export const isSuperAdmin = (user) => getUserRoles(user).includes(ROLES.SUPER_ADMIN);

export const getRoleBadgeClass = (role) => {
  const roleName = Array.isArray(role) ? role[0] : role;
  switch (roleName) {
    case ROLES.ADMIN: return 'role-badge role-badge-admin';
    case ROLES.MANAGEMENT: return 'role-badge role-badge-management';
    case ROLES.DELIVERY_DRIVER: return 'role-badge role-badge-delivery-driver';
    case ROLES.GUEST: return 'role-badge role-badge-guest';
    default: return 'role-badge role-badge-customer';
  }
};
