import { createHmac, timingSafeEqual } from "crypto";
import type { CheckoutDetails, Order } from "@/lib/aeris";
import { cryptoId } from "@/lib/aeris";
import { getPool, ensureSchema } from "@/lib/server/db";
import { requireEnv } from "@/lib/server/env";
import { logAuditEvent } from "@/lib/server/audit";
import type { SessionState } from "@/lib/server/state";
import { normalizeSessionState, sanitizeStateForStorage } from "@/lib/server/state";

type CheckoutSnapshot = {
  storeId: string;
  storeSlug: string;
  cart: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
  delivery: CheckoutDetails;
  subtotal: number;
  logisticsFee: number;
  platformFee: number;
  merchantEarnings: number;
  total: number;
  customer: {
    name: string;
    email: string;
  };
};

type CheckoutSessionRow = {
  reference: string;
  guest_token: string | null;
  store_id: string;
  store_slug: string;
  payload_json: CheckoutSnapshot;
  status: string;
  raw_status: string | null;
  order_reference: string | null;
};

type StoreRow = {
  id: string;
  slug: string;
  state_json: SessionState;
};

type SessionRow = {
  token: string;
  state_json: SessionState;
};

function normalizeWebhookSignature(rawBody: string) {
  const parsed = JSON.parse(rawBody) as { data?: unknown };
  return JSON.stringify(parsed?.data ?? {});
}

export function verifyKoraWebhookSignature(rawBody: string, signature?: string | null) {
  if (!signature) {
    return false;
  }

  const secretKey = requireEnv("KORA_SECRET_KEY");
  const expected = createHmac("sha256", secretKey)
    .update(normalizeWebhookSignature(rawBody))
    .digest("hex");

  const provided = signature.trim();
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function persistCheckoutSession(input: {
  reference: string;
  guestToken?: string | null;
  snapshot: CheckoutSnapshot;
}) {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO checkout_sessions (reference, guest_token, store_id, store_slug, payload_json, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
     ON CONFLICT (reference)
     DO UPDATE SET
       guest_token = EXCLUDED.guest_token,
       store_id = EXCLUDED.store_id,
       store_slug = EXCLUDED.store_slug,
       payload_json = EXCLUDED.payload_json,
       updated_at = NOW()`,
    [
      input.reference,
      input.guestToken || null,
      input.snapshot.storeId,
      input.snapshot.storeSlug,
      JSON.stringify(input.snapshot)
    ]
  );
}

export async function findCheckoutSession(reference: string) {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<CheckoutSessionRow>(
    `SELECT reference, guest_token, store_id, store_slug, payload_json, status, raw_status, order_reference
     FROM checkout_sessions
     WHERE reference = $1
     LIMIT 1`,
    [reference]
  );
  return rows[0] || null;
}

async function findStoreByIdOrSlug(storeId: string, slug: string) {
  const pool = getPool();
  const { rows } = await pool.query<StoreRow>(
    `SELECT id, slug, state_json
     FROM stores
     WHERE id = $1 OR slug = $2
     LIMIT 1`,
    [storeId, slug]
  );

  return rows[0] || null;
}

async function syncGuestSession(guestToken: string | null, nextStoreState: SessionState, order: Order) {
  if (!guestToken) {
    return;
  }

  const pool = getPool();
  const { rows } = await pool.query<SessionRow>(
    `SELECT token, state_json
     FROM sessions
     WHERE token = $1
     LIMIT 1`,
    [guestToken]
  );

  const existing = rows[0];
  if (!existing) {
    return;
  }

  const currentState = normalizeSessionState(existing.state_json);
  const nextState = sanitizeStateForStorage({
    ...currentState,
    store: nextStoreState.store,
    orders: [order, ...currentState.orders.filter((candidate) => candidate.reference !== order.reference)],
    cart: [],
    activity: [`New paid order ${order.reference}`, ...currentState.activity]
  });

  await pool.query(
    `UPDATE sessions
     SET state_json = $2::jsonb, updated_at = NOW(), expires_at = NOW() + INTERVAL '30 days'
     WHERE token = $1`,
    [guestToken, JSON.stringify(nextState)]
  );
}

async function updateCheckoutStatus(reference: string, status: string, rawStatus?: string | null, orderReference?: string | null) {
  const pool = getPool();
  await pool.query(
    `UPDATE checkout_sessions
     SET status = $2,
         raw_status = COALESCE($3, raw_status),
         order_reference = COALESCE($4, order_reference),
         processed_at = CASE WHEN $2 = 'paid' THEN COALESCE(processed_at, NOW()) ELSE processed_at END,
         updated_at = NOW()
     WHERE reference = $1`,
    [reference, status, rawStatus || null, orderReference || null]
  );
}

export async function finalizePaidCheckout(reference: string, rawStatus = "success") {
  await ensureSchema();
  const checkout = await findCheckoutSession(reference);
  if (!checkout) {
    return null;
  }

  const storeRow = await findStoreByIdOrSlug(checkout.store_id, checkout.store_slug);
  if (!storeRow) {
    await updateCheckoutStatus(reference, "orphaned", rawStatus);
    return null;
  }

  const storeState = normalizeSessionState(storeRow.state_json);
  const existingOrder =
    storeState.orders.find((candidate) => candidate.koraReference === reference) ||
    (checkout.order_reference
      ? storeState.orders.find((candidate) => candidate.reference === checkout.order_reference)
      : undefined);

  if (existingOrder) {
    await syncGuestSession(checkout.guest_token, storeState, existingOrder);
    await updateCheckoutStatus(reference, "paid", rawStatus, existingOrder.reference);
    return { order: existingOrder, state: storeState };
  }

  const snapshot = checkout.payload_json;
  const order: Order = {
    id: cryptoId("order"),
    reference: `AERIS_${Date.now().toString(36).toUpperCase()}`,
    storeId: storeState.store.id,
    koraReference: reference,
    items: snapshot.cart,
    subtotal: snapshot.subtotal,
    logisticsFee: snapshot.logisticsFee,
    platformFee: snapshot.platformFee,
    merchantEarnings: snapshot.merchantEarnings,
    status: "paid",
    paymentState: "paid",
    delivery: snapshot.delivery,
    createdAt: new Date().toISOString(),
    payoutAllocated: 0
  };

  const nextStoreState = sanitizeStateForStorage({
    ...storeState,
    orders: [order, ...storeState.orders],
    activity: [`New paid order ${order.reference}`, ...storeState.activity]
  });

  const pool = getPool();
  await pool.query(
    `UPDATE stores
     SET state_json = $2::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [storeRow.id, JSON.stringify(nextStoreState)]
  );

  await syncGuestSession(checkout.guest_token, nextStoreState, order);
  await updateCheckoutStatus(reference, "paid", rawStatus, order.reference);
  await logAuditEvent(storeRow.id, "payment_confirmed", `Kora charge ${reference} confirmed and order ${order.reference} created.`);

  return { order, state: nextStoreState };
}

export async function markCheckoutFailed(reference: string, rawStatus = "failed") {
  await ensureSchema();
  const checkout = await findCheckoutSession(reference);
  if (!checkout) {
    return;
  }

  await updateCheckoutStatus(reference, "failed", rawStatus, checkout.order_reference);
}

