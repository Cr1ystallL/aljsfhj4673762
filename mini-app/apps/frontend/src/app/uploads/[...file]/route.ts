import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ file?: string[] }> }
) {
  const { file } = await ctx.params;
  if (!file || file.length === 0) {
    return new NextResponse('File not found', { status: 404 });
  }

  const filename = path.normalize(file.join('/')).replace(/^(\.\.[\/\\])+/, '');

  const searchDirs = [
    path.join(process.cwd(), 'public', 'uploads'),
    path.join(process.cwd(), '..', 'frontend', 'public', 'uploads'),
    path.join(process.cwd(), 'apps', 'frontend', 'public', 'uploads'),
    '/var/www/MACVBET/mini-app/apps/frontend/public/uploads',
    '/var/www/MACVBET/mini-app/apps/backend/public/uploads',
  ];

  let foundPath: string | null = null;
  for (const dir of searchDirs) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) {
      foundPath = candidate;
      break;
    }
  }

  if (!foundPath) {
    return new NextResponse('File not found', { status: 404 });
  }

  const ext = path.extname(foundPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const fileBuffer = await fs.promises.readFile(foundPath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
