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

export const hasRole = (roles: Array<RoleName | { name: string }> | undefined, target: RoleName): boolean => {
  if (!roles) return false;
  return roles.some((r) => {
    const name = typeof r === 'string' ? r : r.name;
    return name === target;
  });
};

export const hasAnyRole = (roles: Array<RoleName | { name: string }> | undefined, targets: RoleName[]): boolean => {
  return targets.some((role) => hasRole(roles, role));
};

