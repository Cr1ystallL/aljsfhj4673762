import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy Crash game API to the Fastify backend.
 * Same-origin call from the browser → Next forwards to the Fastify host with
 * cookies attached so authentication works through the cookie session layer.
 */
function backendBaseUrl(): string {
  return 'http://127.0.0.1:4000';
}

async function proxy(
  request: NextRequest,
  slug: string[] | undefined,
  method: 'GET' | 'POST'
) {
  const cleanBase = backendBaseUrl();
  const pathSeg = slug?.length ? slug.join('/') : '';
  const fullUrl = `${cleanBase}/api/games/crash${
    pathSeg ? `/${pathSeg}` : ''
  }${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  const authHeader = request.headers.get('authorization');
  if (authHeader) headers['authorization'] = authHeader;

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
