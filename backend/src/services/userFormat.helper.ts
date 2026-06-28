import { RoleName, isRoleName } from '../constants/roles';
import { DeliveryEligibilitySource, DeliveryZoneStatus } from '../../generated/prisma';

export function toRoleNames(userRoles: Array<{ role: { name: string } | null }>): RoleName[] {
  return userRoles
    .map(({ role }) => role?.name)
    .filter((name): name is RoleName => isRoleName(name));
}

export function formatUser<T extends {
  id: number;
  username: string;
  address?: string | null;
  cashapp?: string | null;
  zelle?: string | null;
  venmo?: string | null;
  phoneNumber?: string | null;
  approved?: boolean;
  rejected?: boolean;
  rejectionNote?: string | null;
  deliveryStatus?: DeliveryZoneStatus | null;
  deliverySource?: DeliveryEligibilitySource | null;
  deliveryDistanceMiles?: number | null;
  deliveryCheckedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
  roles: Array<{ role: { name: string } | null }>;
}>(user: T) {
  const {
    id,
    username,
    address,
    cashapp,
    zelle,
    venmo,
    phoneNumber,
    approved,
    rejected,
    rejectionNote,
    deliveryStatus,
    deliverySource,
    deliveryDistanceMiles,
    deliveryCheckedAt,
    createdAt,
    updatedAt,
  } = user;

  return {
    id,
    username,
    ...(address ? { address } : {}),
    ...(cashapp ? { cashapp } : {}),
    ...(zelle ? { zelle } : {}),
    ...(venmo ? { venmo } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(approved !== undefined ? { approved } : {}),
    ...(rejected !== undefined ? { rejected } : {}),
    ...(rejectionNote ? { rejectionNote } : {}),
    ...(deliveryStatus !== undefined && deliveryStatus !== null ? { deliveryStatus } : {}),
    ...(deliverySource !== undefined && deliverySource !== null ? { deliverySource } : {}),
    ...(deliveryDistanceMiles !== undefined && deliveryDistanceMiles !== null ? { deliveryDistanceMiles } : {}),
    ...(deliveryCheckedAt !== undefined && deliveryCheckedAt !== null ? { deliveryCheckedAt } : {}),
    roles: toRoleNames(user.roles),
    createdAt,
    ...(updatedAt ? { updatedAt } : {})
  };
}
