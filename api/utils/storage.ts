import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const NEWS_IMAGE_DIR = process.env.NEWS_IMAGE_DIR || path.resolve(process.cwd(), 'uploads', 'news');
const NEWS_IMAGE_BASE_URL = process.env.NEWS_IMAGE_BASE_URL;

function sanitizeExt(ext?: string) {
  if (!ext) return 'bin';
  const cleaned = ext.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned || 'bin';
}

function buildPublicPath(filename: string) {
  if (NEWS_IMAGE_BASE_URL) {
    const base = NEWS_IMAGE_BASE_URL.endsWith('/') ? NEWS_IMAGE_BASE_URL.slice(0, -1) : NEWS_IMAGE_BASE_URL;
    return `${base}/${filename}`;
  }
  return `/uploads/news/${filename}`;
}

export async function saveNewsImageFromBuffer(buffer: Buffer, extension?: string) {
  await fs.mkdir(NEWS_IMAGE_DIR, { recursive: true });

  const safeExt = sanitizeExt(extension);
  const filename = `${Date.now()}-${randomUUID()}.${safeExt}`;
  const fullPath = path.join(NEWS_IMAGE_DIR, filename);

  await fs.writeFile(fullPath, buffer);

  return {
    filename,
    fullPath,
    publicPath: buildPublicPath(filename)
  };
}
