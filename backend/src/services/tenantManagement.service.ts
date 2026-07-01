import { getUnscopedPrisma } from '../config/database';
import { Prisma } from '../../generated/prisma';
import { AppError } from '../middleware/error.middleware';
import { hashPassword } from '../utils/password.util';
import { generateMachineToken } from '../utils/machineToken';
import { logger } from '../utils/logger';

export interface TenantListItem {
  id: number;
  slug: string;
  name: string;
  status: string;
  plan: string | null;
  hasReportingToken: boolean;
  hasPrintKey: boolean;
  createdAt: Date;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  plan?: string;
  adminUsername: string;
  adminPassword: string;
}

export interface CreateTenantResult {
  tenant: { id: number; slug: string; name: string; status: string };
  reportingToken: string;
  printAgentKey: string;
}

export interface RegenerateTokensResult {
  reportingToken: string;
  printAgentKey: string;
}

export interface AuditActor {
  userId?: number;
  username?: string;
  requestId?: string;
}

export class TenantManagementService {
  private get prisma() {
    return getUnscopedPrisma();
  }

  /**
   * Write a platform audit row. MUST be called with a transaction client so the
   * audit record commits atomically with the mutation it describes.
   */
  private async recordTenantAudit(
    tx: Prisma.TransactionClient,
    entry: {
      action: string;
      targetTenantId: number;
      actor: AuditActor;
      detail?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.tenantAuditLog.create({
      data: {
        action: entry.action,
        targetTenantId: entry.targetTenantId,
        actorUserId: entry.actor.userId ?? null,
        actorUsername: entry.actor.username ?? 'unknown',
        requestId: entry.actor.requestId ?? null,
        detail: entry.detail,
      },
    });
  }

  /**
   * List all tenants with token-presence flags (never exposes hashes).
   */
  async listTenants(): Promise<TenantListItem[]> {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        plan: true,
        reportingTokenHash: true,
        printAgentKeyHash: true,
        createdAt: true,
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      plan: t.plan,
      hasReportingToken: t.reportingTokenHash !== null,
      hasPrintKey: t.printAgentKeyHash !== null,
      createdAt: t.createdAt,
    }));
  }

  /**
   * Provision a new tenant with a default store, admin user, and both machine tokens.
   * Returns the plaintext tokens once — they are never stored or returned again.
   */
  async createTenant(input: CreateTenantInput, actor: AuditActor): Promise<CreateTenantResult> {
    const { slug, name, plan, adminUsername, adminPassword } = input;

    // Reject duplicate slugs up-front with a clear 409 (the DB unique constraint
    // would also catch it but with a less descriptive error).
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      throw new AppError(`Tenant with slug "${slug}" already exists`, 409);
    }

    const reportingMachineToken = generateMachineToken();
    const printMachineToken = generateMachineToken();
    const hashedPassword = await hashPassword(adminPassword);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create the tenant with both token hashes.
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name,
          plan: plan ?? null,
          status: 'ACTIVE',
          reportingTokenHash: reportingMachineToken.hash,
          printAgentKeyHash: printMachineToken.hash,
        },
      });

      // 2. Create a default store for the tenant.
      const store = await tx.store.create({
        data: {
          tenantId: tenant.id,
          name,
          slug: 'main',
          isDefault: true,
          status: 'ACTIVE',
        },
      });

      // 3. Look up (or create) the global ADMIN role.
      let adminRole = await tx.role.findUnique({ where: { name: 'ADMIN' } });
      if (!adminRole) {
        adminRole = await tx.role.create({ data: { name: 'ADMIN' } });
      }

      // 4. Create the admin user for this tenant.
      const user = await tx.user.create({
        data: {
          username: adminUsername,
          password: hashedPassword,
          approved: true,
          tenantId: tenant.id,
        },
      });

      // 5. Assign the ADMIN role to the user across ALL of this tenant's stores
      //    (storeId 0 = all-stores), so the tenant admin can manage every store,
      //    including ones added later.
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
          tenantId: tenant.id,
          storeId: 0,
        },
      });

      await this.recordTenantAudit(tx, {
        action: 'TENANT_CREATED',
        targetTenantId: tenant.id,
        actor,
        detail: { slug: tenant.slug, name: tenant.name, plan: tenant.plan },
      });

      return { tenant, store };
    });

    logger.info('Tenant provisioned', {
      tenantId: result.tenant.id,
      slug: result.tenant.slug,
    });

    return {
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        name: result.tenant.name,
        status: result.tenant.status,
      },
      reportingToken: reportingMachineToken.token,
      printAgentKey: printMachineToken.token,
    };
  }

  /**
   * Activate or suspend a tenant. Writes an audit row atomically with the change.
   * The action is derived from the target status: SUSPENDED → TENANT_SUSPENDED,
   * ACTIVE → TENANT_RESTORED (covers both un-suspend and restore-from-deleted).
   */
  async setTenantStatus(id: number, status: 'ACTIVE' | 'SUSPENDED', actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      const updated = await tx.tenant.update({ where: { id }, data: { status } });
      await this.recordTenantAudit(tx, {
        action: status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_RESTORED',
        targetTenantId: id,
        actor,
        detail: { from: tenant.status, to: status },
      });
      return updated;
    });
  }

  /**
   * Generate fresh machine tokens for an existing tenant.
   * Returns the new plaintext tokens once — the old tokens are immediately invalidated.
   */
  async regenerateTokens(id: number, actor: AuditActor): Promise<RegenerateTokensResult> {
    const reportingMachineToken = generateMachineToken();
    const printMachineToken = generateMachineToken();

    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      await tx.tenant.update({
        where: { id },
        data: {
          reportingTokenHash: reportingMachineToken.hash,
          printAgentKeyHash: printMachineToken.hash,
        },
      });
      await this.recordTenantAudit(tx, {
        action: 'TENANT_TOKENS_REGENERATED',
        targetTenantId: id,
        actor,
      });
    });

    logger.info('Tenant machine tokens regenerated', { tenantId: id });

    return {
      reportingToken: reportingMachineToken.token,
      printAgentKey: printMachineToken.token,
    };
  }
}

export const tenantManagementService = new TenantManagementService();
