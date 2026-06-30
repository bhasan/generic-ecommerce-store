import { describe, it, expect } from 'vitest';
import path from 'path';
import { tenantUploadsDir, UPLOADS_DIR } from './fileUtils';

describe('tenantUploadsDir', () => {
  it('returns a per-tenant subdirectory of the uploads root', () => {
    const dir = tenantUploadsDir(42);
    expect(dir).toBe(path.join(UPLOADS_DIR, 'tenants', '42'));
  });
});
