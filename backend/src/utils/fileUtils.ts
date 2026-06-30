import fs from 'fs';
import path from 'path';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Absolute path to a tenant's upload directory, created on demand.
 */
export function tenantUploadsDir(tenantId: number): string {
  const dir = path.join(UPLOADS_DIR, 'tenants', String(tenantId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Delete an uploaded file from disk given its URL path. Handles both legacy
 * flat URLs and tenant-scoped URLs. Silently ignores a missing file.
 */
export async function deleteUploadedFile(url: string): Promise<void> {
  if (!url || !url.startsWith('/api/uploads/')) return;
  const rel = url.slice('/api/uploads/'.length).split('?')[0];
  const filePath = path.resolve(UPLOADS_DIR, rel);
  // Refuse anything that escapes the uploads root.
  if (filePath !== UPLOADS_DIR && !filePath.startsWith(UPLOADS_DIR + path.sep)) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Collect all upload URLs from a product record.
 */
export function collectProductImageUrls(product: {
  thumbnail?: string | null;
  image?: string | null;
  images?: string[];
}): string[] {
  const urls: string[] = [];
  if (product.thumbnail) urls.push(product.thumbnail);
  if (product.image) urls.push(product.image);
  if (product.images) urls.push(...product.images);
  return [...new Set(urls)].filter((u) => u.startsWith('/api/uploads/'));
}
