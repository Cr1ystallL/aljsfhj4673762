import https from 'https';
import { logger } from '../utils/logger.js';

/**
 * MacvPay client — Polish payment processor.
 *
 * Base URL: http://167.172.35.229:1337/api/android
 * Auth:     X-Casino-Token header
 *
 * The provider documentation says `https://` but the server actually
 * responds on plain HTTP — Node fetch fails the TLS handshake with
 * "wrong version number" against TLS-targeted requests. We use plain
 * HTTP. The `https.Agent` import is kept for future use if the
 * provider migrates.
 */

const BASE_URL = 'http://167.172.35.229:1337/api/android';
const TOKEN = 'cas_08bda731b6e42e5997b7d8977b5d01d3513db07a17206a92';

// Reserved for a future TLS migration. Disables certificate validation
// when (and if) the provider switches to HTTPS with a self-signed cert.
const _agent = new https.Agent({ rejectUnauthorized: false });
void _agent;

/* ---------------------------------------------------------------- types */

export interface MacvPayOrderResponse {
  success: true;
  id: string;
  price: number;
  currency: string;
  type: 'bank' | 'revolut';
  card: string;
  recipient: string;
  details: string;
  minutes: number;
}

export interface MacvPayErrorResponse {
  success: false;
  error: string;
}

export type MacvPayCreateResult = MacvPayOrderResponse | MacvPayErrorResponse;

export interface MacvPayOrderStatus {
  success: true;
  id: string;
  price: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  paid_amount: number | null;
  paid_at: string | null;
  external_id: string | null;
  client_id: string | null;
  created_at: string;
  expires_at: string;
}

export interface MacvPayWebhookPayload {
  id: string;
  external_id: string | null;
  client_id: string | null;
  paid: number;
  price: number;
  currency: string;
  status: 'paid';
  paid_at: string;
}

/* ---------------------------------------------------------------- API */

/**
 * Create a deposit order. Returns the unique amount the user must pay.
 *
 * @param amount     Amount in PLN the user wants to deposit.
 * @param userId     Our internal user id (sent as client_id).
 * @param externalId Our unique transaction id (sent as external_id).
 * @param webhookUrl Public URL MacvPay will POST to on payment.
 * @param type       "bank" (default) or "revolut".
 */
export async function createOrder(
  amount: number,
  userId: string,
  externalId: string,
  webhookUrl: string,
  type: 'bank' | 'revolut' = 'bank'
): Promise<MacvPayCreateResult> {
  try {
    const res = await fetch(`${BASE_URL}/casino/get_card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Casino-Token': TOKEN,
        'X-Webhook-URL': webhookUrl,
      },
      body: JSON.stringify({
        currency: 'PLN',
        price: amount,
        type,
        client_id: userId,
        external_id: externalId,
      }),
    });
    return (await res.json()) as MacvPayCreateResult;
  } catch (err) {
    logger.error({ err }, 'MacvPay createOrder failed');
    return { success: false, error: 'Network error' };
  }
}

/**
 * Cancel an order (user closed the payment window before paying).
 */
export async function cancelOrder(
  orderId: string
): Promise<{ success: boolean }> {
  try {
    const res = await fetch(
      `${BASE_URL}/casino/get_card?cancel=true&id=${encodeURIComponent(orderId)}`,
      {
        method: 'POST',
        headers: { 'X-Casino-Token': TOKEN },
      }
    );
    return (await res.json()) as { success: boolean };
  } catch (err) {
    logger.error({ err, orderId }, 'MacvPay cancelOrder failed');
    return { success: false };
  }
}

/**
 * Fetch the current status of an order (for reconciliation / admin).
 */
export async function getOrderStatus(
  orderId: string
): Promise<MacvPayOrderStatus | MacvPayErrorResponse> {
  try {
    const res = await fetch(
      `${BASE_URL}/casino/order/${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
        headers: { 'X-Casino-Token': TOKEN },
      }
    );
    return (await res.json()) as MacvPayOrderStatus | MacvPayErrorResponse;
  } catch (err) {
    logger.error({ err, orderId }, 'MacvPay getOrderStatus failed');
    return { success: false, error: 'Network error' };
  }
}
