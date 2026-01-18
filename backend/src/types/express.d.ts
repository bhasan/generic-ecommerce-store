import { RoleName } from '../constants/roles';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        roles: RoleName[];
      };
      requestId?: string;
    }
  }
}

export {};
