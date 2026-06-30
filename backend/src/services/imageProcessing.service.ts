import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getTenantContextOrThrow } from '../config/tenantContext';

const MAX_IMAGE_DIMENSION = 1920;
const WEBP_QUALITY = 85;

const isVideoMime = (mime: string) => mime.startsWith('video/');

export async function processUploadedImage(
  file: { filename: string; mimetype: string; destination: string },
): Promise<string> {
  if (isVideoMime(file.mimetype)) return file.filename;

  const inputPath = path.join(file.destination, file.filename);
  const webpFilename = file.filename.replace(/\.[^.]+$/, '.webp');
  const outputPath = path.join(file.destination, webpFilename);

  await sharp(inputPath)
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  await fs.promises.unlink(inputPath);
  return webpFilename;
}

export type FaviconSizeKey = '16' | '32' | '180';

export async function processFaviconUpload(
  file: { filename: string; destination: string },
  version: number,
): Promise<{ '16': string; '32': string; '180': string }> {
  const sizes: Array<{ key: FaviconSizeKey; size: number }> = [
    { key: '16', size: 16 },
    { key: '32', size: 32 },
    { key: '180', size: 180 },
  ];
  // multer now writes the uploaded input into the tenant's dir (file.destination);
  // read from there and write outputs to the same tenant dir.
  const tenantId = getTenantContextOrThrow().tenantId;
  const inputPath = path.join(file.destination, file.filename);
  const faviconUrls = { '16': '', '32': '', '180': '' } as { '16': string; '32': string; '180': string };

  await Promise.all(sizes.map(async ({ key, size }) => {
    const outFilename = `favicon-${size}.png`;
    const outPath = path.join(file.destination, outFilename);
    await sharp(inputPath).resize(size, size, { fit: 'cover' }).png().toFile(outPath);
    faviconUrls[key] = `/api/uploads/tenants/${tenantId}/${outFilename}?v=${version}`;
  }));

  await fs.promises.unlink(inputPath);
  return faviconUrls;
}
