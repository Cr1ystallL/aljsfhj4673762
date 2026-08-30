import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy Blackjack game API to the Fastify backend.
 *
 * Same-origin call from the browser → Next forwards to Fastify on loopback.
 * Do NOT fall back to NEXT_PUBLIC_API_URL (https://macvbet.nl): that
 * re-enters this Next route and returns 500 on create-table / tables.
 */
function backendBaseUrl(): string {
  const b = process.env.INTERNAL_API_URL || process.env.BACKEND_URL || 'http://127.0.0.1:4000';
  return b.replace(/\/$/, '');
}

export const dynamic = 'force-dynamic';

async function proxy(
  request: NextRequest,
  slug: string[] | undefined,
  method: 'GET' | 'POST'
) {
  const cleanBase = backendBaseUrl();
  const pathSeg = slug?.length ? slug.join('/') : '';
  const fullUrl = `${cleanBase}/api/games/blackjack${
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

  try {
    const res = await fetch(fullUrl, { method, headers, body, cache: 'no-store' });
    const text = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': contentType },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Blackjack proxy failed';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502 }
    );
  }
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
