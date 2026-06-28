export const ROLE_NAMES = ['GUEST', 'CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER', 'VIP', 'SUPER_ADMIN'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLES = {
  GUEST: 'GUEST',
  CUSTOMER: 'CUSTOMER',
  EMPLOYEE: 'EMPLOYEE',
  MANAGEMENT: 'MANAGEMENT',
  ADMIN: 'ADMIN',
  DELIVERY_DRIVER: 'DELIVERY_DRIVER',
  VIP: 'VIP',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const satisfies Record<string, RoleName>;

export const isRoleName = (value: unknown): value is RoleName => {
  if (typeof value !== 'string') return false;
  return ROLE_NAMES.includes(value as RoleName);
};

export const hasRole = (roles: RoleName[] | undefined, target: RoleName): boolean => {
  return Boolean(roles?.includes(target));
};

export const hasAnyRole = (roles: RoleName[] | undefined, targets: RoleName[]): boolean => {
  return targets.some((role) => hasRole(roles, role));
};

