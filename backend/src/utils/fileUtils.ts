import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Delete an uploaded file from disk given its URL path (e.g. /api/uploads/filename.jpg).
 * Silently ignores if the file doesn't exist.
 */
export async function deleteUploadedFile(url: string): Promise<void> {
  if (!url || !url.startsWith('/api/uploads/')) return;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
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
