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
  return process.env.INTERNAL_API_URL || 'http://127.0.0.1:4000';
}

export const dynamic = 'force-dynamic';

async function proxy(
  request: NextRequest,
  slug: string[] | undefined,
  method: string
) {
  const cleanBase = backendBaseUrl();
  const pathSeg = slug?.length ? slug.join('/') : '';
  const fullUrl = `${cleanBase}/api/_x${
    pathSeg ? `/${pathSeg}` : ''
  }${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  const authHeader = request.headers.get('authorization');
  if (authHeader) headers['authorization'] = authHeader;

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = request.headers.get('content-type');
    if (contentType) {
      headers['content-type'] = contentType;
    }
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) {
      body = Buffer.from(buffer);
    }
  }

  const res = await fetch(fullUrl, { method, headers, body, cache: 'no-store' });
  const arrayBuf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'application/json';

  return new NextResponse(arrayBuf, {
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

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await ctx.params;
  return proxy(request, slug, 'PATCH');
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await ctx.params;
  return proxy(request, slug, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await ctx.params;
  return proxy(request, slug, 'DELETE');
}
