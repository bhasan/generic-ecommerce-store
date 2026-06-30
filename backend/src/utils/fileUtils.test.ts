import { describe, it, expect } from 'vitest';
import path from 'path';
import { tenantUploadsDir, UPLOADS_DIR, resolveTenantUploadPath } from './fileUtils';

describe('tenantUploadsDir', () => {
  it('returns a per-tenant subdirectory of the uploads root', () => {
    const dir = tenantUploadsDir(42);
    expect(dir).toBe(path.join(UPLOADS_DIR, 'tenants', '42'));
  });
});

describe('resolveTenantUploadPath', () => {
  const tenantCtx = (tenantId: number) => ({ tenantId, scope: 'tenant' as const });

  it('returns the on-disk path for the active tenant own file', () => {
    const p = resolveTenantUploadPath(42, 'pic.webp', tenantCtx(42));
    expect(p).toBe(path.join(UPLOADS_DIR, 'tenants', '42', 'pic.webp'));
  });

  it('denies (null) when a tenant requests another tenant file', () => {
    expect(resolveTenantUploadPath(99, 'secret.webp', tenantCtx(42))).toBeNull();
  });

  it('allows super-admin to read any tenant file', () => {
    const p = resolveTenantUploadPath(99, 'x.webp', { tenantId: 0, scope: 'super-admin' });
    expect(p).toBe(path.join(UPLOADS_DIR, 'tenants', '99', 'x.webp'));
  });

  it('blocks path traversal in the filename', () => {
    const p = resolveTenantUploadPath(42, '../../etc/passwd', tenantCtx(42));
    expect(p).toBe(path.join(UPLOADS_DIR, 'tenants', '42', 'passwd'));
  });

  it('denies a non-integer tenant id', () => {
    expect(resolveTenantUploadPath(Number('abc'), 'x.webp', tenantCtx(42))).toBeNull();
  });

  it('denies when there is no tenant context (fail closed)', () => {
    expect(resolveTenantUploadPath(42, 'pic.webp', undefined)).toBeNull();
  });
});
