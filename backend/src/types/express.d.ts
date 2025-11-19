import { Role } from '../generated/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        role: Role;
      };
    }
  }
}

export {};
