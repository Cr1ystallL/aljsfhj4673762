import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy /api/sports/* to Fastify so same-origin cookie auth works.
 */
function backendBaseUrl(): string {
  return process.env.INTERNAL_API_URL || 'http://127.0.0.1:4000';
}

export const dynamic = 'force-dynamic';

async function proxy(
  request: NextRequest,
  slug: string[] | undefined,
  method: 'GET' | 'POST'
) {
  const pathSeg = slug?.length ? slug.join('/') : '';
  const fullUrl = `${backendBaseUrl()}/api/sports${
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

  try {
    const res = await fetch(fullUrl, { method, headers, body, cache: 'no-store' });
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') || text.trim().startsWith('<')) {
      return NextResponse.json(
        { ok: false, error: 'Сервис временно недоступен. Попробуйте снова.' },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Сервер недоступен. Попробуйте позже.' },
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
