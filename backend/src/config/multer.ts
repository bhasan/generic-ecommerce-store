import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Request } from 'express';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB for videos
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

ensureUploadsDir();

const fileFilter = (
  _req: Request,
  file: any,
  cb: any
): void => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM.'));
  }
};

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req: any, file: any, cb: any) => {
    let ext = file.mimetype.split('/')[1];
    if (file.mimetype === 'image/jpeg') ext = 'jpg';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});
