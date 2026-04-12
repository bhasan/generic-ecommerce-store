import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import prisma from '../config/database';
import { collectProductImageUrls } from '../utils/fileUtils';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Escape a value for inclusion in a CSV cell.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 */
function csvEscape(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildCsvRow(fields: (string | number | boolean | null | undefined)[]): string {
  return fields.map(csvEscape).join(',');
}

/**
 * Stream a ZIP file containing products.csv and all associated product images.
 *
 * CSV columns: id, name, categoryName, price, description, stock, stockEnabled,
 *              thumbnail, image, images
 *
 * Image fields store bare filenames (e.g. abc.webp), not /api/uploads/ URLs.
 * The `images` array column uses semicolons to separate multiple filenames.
 *
 * The ZIP images/ folder is a flat directory; filenames are timestamp-prefixed
 * and unique by design.
 */
export async function streamProductsExportZip(res: Response): Promise<void> {
  const [products, categories] = await Promise.all([
    prisma.productItem.findMany({ orderBy: { id: 'asc' } }),
    prisma.category.findMany(),
  ]);

  const categoryMap: Record<number, string> = {};
  for (const cat of categories) {
    categoryMap[cat.id] = cat.name;
  }

  const urlToFilename = (url: string | null | undefined): string => {
    if (!url) return '';
    return url.split('/').pop() ?? '';
  };

  const CSV_HEADER = 'id,name,categoryName,price,description,stock,stockEnabled,thumbnail,image,images';

  const csvRows = products.map((p) => {
    const imagesFilenames = (p.images ?? []).map(urlToFilename).filter(Boolean).join(';');
    return buildCsvRow([
      p.id,
      p.name,
      categoryMap[p.categoryId] ?? '',
      p.price,
      p.description ?? '',
      p.stock,
      p.stockEnabled,
      urlToFilename(p.thumbnail),
      urlToFilename(p.image),
      imagesFilenames,
    ]);
  });

  const csvContent = [CSV_HEADER, ...csvRows].join('\r\n') + '\r\n';

  // Collect unique image filenames across all products
  const allImageUrls = products.flatMap((p) =>
    collectProductImageUrls({
      thumbnail: p.thumbnail,
      image: p.image,
      images: p.images,
    })
  );
  const uniqueFilenames = [...new Set(allImageUrls.map(urlToFilename).filter(Boolean))];

  const date = new Date().toISOString().slice(0, 10);
  const zipFilename = `products-export-${date}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    // Headers already sent — best we can do is destroy the response
    res.destroy(err);
  });

  archive.pipe(res);

  archive.append(csvContent, { name: 'products.csv' });

  for (const filename of uniqueFilenames) {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `images/${filename}` });
    }
  }

  await archive.finalize();
}
