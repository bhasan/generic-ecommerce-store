import { RoleName } from '../constants/roles';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        username: string;
        roles: RoleName[];
      };
      requestId?: string;
      tenantId?: number | null;
      tenant?: { id: number; slug: string; status: string } | null;
      store?: { id: number } | null;
    }
  }
}

export {};
