import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy public lobby stats to Fastify.
 * Online and 24h payouts are real (presence + paid withdrawals) —
 * this route must not invent a second display multiplier.
 */
function backendBaseUrl(): string {
  return process.env.INTERNAL_API_URL || 'http://127.0.0.1:4000';
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    const cookie = request.headers.get('cookie');
    if (cookie) headers['cookie'] = cookie;
    const res = await fetch(`${backendBaseUrl()}/api/stats`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, online: 0, payouts24h: 0, currency: 'zł' },
      { status: 200 }
    );
  }
}
