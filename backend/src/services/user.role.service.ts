import prisma from '../config/database';
import { logger } from '../utils/logger';

export class UserRoleService {
  /**
   * Get all roles from database
   */
  async getAllRoles() {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    logger.info('Fetched roles', {
      count: roles.length,
    });

    return roles.map(role => role.name);
  }
}
