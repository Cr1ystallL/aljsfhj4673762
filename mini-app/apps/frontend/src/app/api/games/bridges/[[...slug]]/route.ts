import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy Bridges game API calls to the Fastify backend.
 *
 * Keeping the browser request same-origin preserves the authenticated session
 * cookie and makes local/production routing consistent.
 */
function backendBaseUrl(): string {
  const baseUrl =
    process.env.INTERNAL_API_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL;

  return (baseUrl || 'http://127.0.0.1:4000').replace(/\/$/, '');
}

async function proxy(
  request: NextRequest,
  slug: string[] | undefined,
  method: 'GET' | 'POST'
) {
  const path = slug?.length ? `/${slug.join('/')}` : '';
  const url = `${backendBaseUrl()}/api/games/bridges${path}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers.cookie = cookie;

  let body: string | undefined;
  if (method === 'POST') {
    headers['content-type'] =
      request.headers.get('content-type') || 'application/json';
    body = await request.text();
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      'content-type':
        response.headers.get('content-type') || 'application/json',
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await context.params;
  return proxy(request, slug, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await context.params;
  return proxy(request, slug, 'POST');
}
