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
