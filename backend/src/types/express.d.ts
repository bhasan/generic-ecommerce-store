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
    }
  }
}

export {};
