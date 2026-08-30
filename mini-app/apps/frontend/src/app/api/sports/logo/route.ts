import { NextRequest, NextResponse } from 'next/server';

function backendBaseUrl(): string {
  return process.env.INTERNAL_API_URL || 'http://127.0.0.1:4000';
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get('u') || '';
  const fullUrl = `${backendBaseUrl()}/api/sports/logo?u=${encodeURIComponent(u)}`;
  const res = await fetch(fullUrl, { cache: 'no-store' });
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'image/png',
      'cache-control': res.headers.get('cache-control') || 'public, max-age=86400',
    },
  });
}
