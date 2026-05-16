import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for covert admin endpoints.
 *
 * Forwards `/api/_x/...` to the Fastify backend with cookies. The
 * underlying endpoints return 404 for non-admins, so this proxy is a
 * pass-through with no special handling — non-admins see a generic
 * 404, same as for any unknown route.
 */
function backendBaseUrl(): string {
  const b =
    process.env.INTERNAL_API_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL;
  if (b) return b.replace(/\/$/, '');
  return 'http://127.0.0.1:4000';
}

async function proxy(
  request: NextRequest,
  slug: string[] | undefined,
  method: 'GET' | 'POST'
) {
  const cleanBase = backendBaseUrl();
  const pathSeg = slug?.length ? slug.join('/') : '';
  const fullUrl = `${cleanBase}/api/_x${
    pathSeg ? `/${pathSeg}` : ''
  }${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;

  let body: string | undefined;
  if (method === 'POST') {
    headers['content-type'] =
      request.headers.get('content-type') || 'application/json';
    body = await request.text();
  }

  const res = await fetch(fullUrl, { method, headers, body });
  const text = await res.text();
  const contentType = res.headers.get('content-type') || 'application/json';

  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': contentType },
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await ctx.params;
  return proxy(request, slug, 'GET');
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await ctx.params;
  return proxy(request, slug, 'POST');
}
