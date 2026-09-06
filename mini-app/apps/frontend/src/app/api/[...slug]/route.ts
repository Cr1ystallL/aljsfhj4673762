import { NextRequest, NextResponse } from 'next/server';

/**
 * Catch-all proxy for API paths that do not have a dedicated Next route
 * (wallet: crypto-deposit, withdrawals, bonuses, vip, …).
 * More specific `src/app/api/...` routes take precedence.
 *
 * Do NOT fall back to NEXT_PUBLIC_API_URL — that can loop back into Next.
 */
function backendBaseUrl(): string {
  const b = process.env.INTERNAL_API_URL || process.env.BACKEND_URL;
  if (b) return b.replace(/\/$/, '');
  return 'http://127.0.0.1:4000';
}

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, slug: string[] | undefined, method: string) {
  const pathSeg = slug?.length ? slug.join('/') : '';
  const fullUrl = `${backendBaseUrl()}/api${pathSeg ? `/${pathSeg}` : ''}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  const authHeader = request.headers.get('authorization');
  if (authHeader) headers['authorization'] = authHeader;

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = request.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) body = Buffer.from(buffer);
  }

  try {
    const res = await fetch(fullUrl, { method, headers, body, cache: 'no-store' });
    const arrayBuf = await res.arrayBuffer();
    return new NextResponse(arrayBuf, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'API proxy failed';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
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
