import path from 'path';

export interface Account {
  role: string;
  username: string;
  password: string;
  storageStatePath: string;
}

function authPath(role: string) {
  return path.join(__dirname, '..', '.auth', `${role}.json`);
}

export const ACCOUNTS = {
  admin: {
    role: 'admin',
    username: 'admin',
    password: 'admin123',
    storageStatePath: authPath('admin'),
  },
  manager: {
    role: 'manager',
    username: 'manager',
    password: 'manager123',
    storageStatePath: authPath('manager'),
  },
  employee: {
    role: 'employee',
    username: 'employee',
    password: 'employee123',
    storageStatePath: authPath('employee'),
  },
  customer: {
    role: 'customer',
    username: 'johncustomer',
    password: 'customer123',
    storageStatePath: authPath('customer'),
  },
  driver: {
    role: 'driver',
    username: 'driver',
    password: 'driver123',
    storageStatePath: authPath('driver'),
  },
} as const;

export const ALL_ACCOUNTS = Object.values(ACCOUNTS);
