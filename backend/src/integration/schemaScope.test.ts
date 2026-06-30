// backend/src/integration/schemaScope.test.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { UNSCOPED_TABLES } from '../config/tenantScope';

describe('Schema scope coverage (CI guardrail #1)', () => {
  it('every database model has a tenantId column except the unscoped allowlist', () => {
    const models = Prisma.dmmf.datamodel.models;
    const missing = models
      .filter((m) => {
        const tableName = m.dbName || m.name.toLowerCase();
        return !UNSCOPED_TABLES.has(tableName);
      })
      .filter((m) => !m.fields.some((f) => f.name === 'tenantId'))
      .map((m) => m.name);
    expect(missing, `models missing tenantId: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('Schema scope coverage (CI guardrail #2)', () => {
  /**
   * Catches the class of bug fixed in the tenant_scope_unique_constraints migration:
   * a bare single-column @unique on a tenant-scoped field (e.g. UiSetting.key,
   * ProductVariant.sku) means one tenant can collide with or read another tenant's
   * row via a unique-constraint lookup.  Tenant-composite @@unique([tenantId, ...])
   * is fine — those appear in uniqueIndexes, not as field.isUnique === true.
   *
   * Add to GLOBAL_UNIQUE_ALLOWLIST only for fields that are legitimately unique
   * across all tenants (e.g. an external-processor transaction ID that must be
   * globally deduplicated).
   */
  const GLOBAL_UNIQUE_ALLOWLIST: ReadonlyArray<{ table: string; field: string }> = [
    // External payment-processor ID — must be globally unique regardless of tenant.
    { table: 'payments', field: 'transactionId' },
  ];

  it('no tenant-scoped model has a single-column @unique on a non-id field (use @@unique([tenantId, ...]) instead)', () => {
    const models = Prisma.dmmf.datamodel.models;
    const violations: string[] = [];

    for (const model of models) {
      const tableName = model.dbName || model.name.toLowerCase();
      if (UNSCOPED_TABLES.has(tableName)) continue; // unscoped tables may have global uniques

      for (const field of model.fields) {
        if (!field.isUnique) continue; // composite @@unique does not set field.isUnique
        if (field.isId) continue;     // @id fields are inherently unique
        const allowlisted = GLOBAL_UNIQUE_ALLOWLIST.some(
          (a) => a.table === tableName && a.field === field.name,
        );
        if (allowlisted) continue;
        violations.push(`${model.name}.${field.name} (table: ${tableName})`);
      }
    }

    expect(
      violations,
      `Tenant-scoped models must not use single-column @unique — use @@unique([tenantId, field]) instead.\nViolations: ${violations.join(', ')}`,
    ).toEqual([]);
  });
});
