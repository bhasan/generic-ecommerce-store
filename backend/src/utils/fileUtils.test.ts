import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tenantUploadsDir, UPLOADS_DIR, resolveTenantUploadPath, deleteUploadedFile } from './fileUtils';

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

describe('deleteUploadedFile', () => {
  it('calls unlink with the correct path for a legacy flat URL', async () => {
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
    await deleteUploadedFile('/api/uploads/foo.webp');
    expect(unlinkSpy).toHaveBeenCalledWith(path.join(UPLOADS_DIR, 'foo.webp'));
    unlinkSpy.mockRestore();
  });

  it('calls unlink with the correct path for a tenant-scoped URL', async () => {
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
    await deleteUploadedFile('/api/uploads/tenants/42/bar.webp');
    expect(unlinkSpy).toHaveBeenCalledWith(path.join(UPLOADS_DIR, 'tenants', '42', 'bar.webp'));
    unlinkSpy.mockRestore();
  });

  it('does NOT call unlink for a path-traversal URL that escapes UPLOADS_DIR', async () => {
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
    await deleteUploadedFile('/api/uploads/../../../etc/passwd');
    expect(unlinkSpy).not.toHaveBeenCalled();
    unlinkSpy.mockRestore();
  });

  it('does NOT call unlink for a URL outside /api/uploads/', async () => {
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
    await deleteUploadedFile('/api/products/image.webp');
    expect(unlinkSpy).not.toHaveBeenCalled();
    unlinkSpy.mockRestore();
  });
});
