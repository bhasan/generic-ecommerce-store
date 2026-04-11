export const ROLES = {
  GUEST: 'GUEST',
  CUSTOMER: 'CUSTOMER',
  EMPLOYEE: 'EMPLOYEE',
  MANAGEMENT: 'MANAGEMENT',
  ADMIN: 'ADMIN',
  DELIVERY_DRIVER: 'DELIVERY_DRIVER',
  VIP: 'VIP',
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
