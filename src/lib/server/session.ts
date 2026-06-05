import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import type { SessionState } from "@/lib/server/state";
import { buildDemoSessionState, buildInitialSessionState, mergePublicStoreState, normalizeSessionState, sanitizeStateForStorage } from "@/lib/server/state";
import { ensureSchema, getPool } from "@/lib/server/db";

export const AUTH_COOKIE = "aeris_auth_session";
export const GUEST_COOKIE = "aeris_guest_session";

function createToken(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  };
}

type SessionRow = {
  token: string;
  kind: "guest" | "merchant";
  merchant_id: string | null;
  store_id: string | null;
  state_json: SessionState;
};

type StoreRow = {
  id: string;
  merchant_id: string | null;
  slug: string;
  owner_email: string | null;
  state_json: SessionState;
};

type MerchantRow = {
  id: string;
  email: string;
  password_hash: string;
  store_id: string | null;
};

async function findSession(token?: string | null) {
  if (!token) {
    return null;
  }

  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<SessionRow>(
    `SELECT token, kind, merchant_id, store_id, state_json
     FROM sessions
     WHERE token = $1 AND expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  return rows[0] || null;
}

export async function findMerchantByEmail(email: string) {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<MerchantRow>(
    `SELECT id, email, password_hash, store_id
     FROM merchants
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return rows[0] || null;
}

export async function findStoreBySlug(slug: string) {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<StoreRow>(
    `SELECT id, merchant_id, slug, owner_email, state_json
     FROM stores
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );

  return rows[0] || null;
}

export async function findStoreByMerchantId(merchantId: string) {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<StoreRow>(
    `SELECT id, merchant_id, slug, owner_email, state_json
     FROM stores
     WHERE merchant_id = $1
     LIMIT 1`,
    [merchantId]
  );

  return rows[0] || null;
}

export async function createGuestSession(initialState?: SessionState) {
  await ensureSchema();
  const token = createToken("guest");
  const state = sanitizeStateForStorage(initialState || buildInitialSessionState());
  const pool = getPool();

  await pool.query(
    `INSERT INTO sessions (token, kind, state_json)
     VALUES ($1, 'guest', $2::jsonb)`,
    [token, JSON.stringify(state)]
  );

  return { token, state };
}

export async function getOrCreateGuestSession() {
  const cookieStore = await cookies();
  const existing = await findSession(cookieStore.get(GUEST_COOKIE)?.value);
  if (existing) {
    return {
      token: existing.token,
      state: normalizeSessionState(existing.state_json)
    };
  }

  return createGuestSession();
}

export async function bootstrapStateForPath(pathname: string) {
  const cookieStore = await cookies();
  const authToken = cookieStore.get(AUTH_COOKIE)?.value;
  const guestToken = cookieStore.get(GUEST_COOKIE)?.value;
  const merchantSession = await findSession(authToken);

  if (merchantSession?.kind === "merchant" && merchantSession.merchant_id) {
    const merchant = await findMerchantByEmail(normalizeSessionState(merchantSession.state_json).auth.email || "");
    const store = await findStoreByMerchantId(merchantSession.merchant_id);

    if (store) {
      const state = normalizeSessionState(store.state_json);
      return {
        cookieName: AUTH_COOKIE,
        cookieValue: merchantSession.token,
        kind: "merchant" as const,
        state: {
          ...state,
          auth: {
            email: merchant?.email || state.store.ownerEmail || state.auth.email,
            password: "",
            loggedIn: true
          }
        }
      };
    }
  }

  const guestSession = guestToken ? await findSession(guestToken) : null;
  const ensuredGuest = guestSession
    ? { token: guestSession.token, state: normalizeSessionState(guestSession.state_json) }
    : await createGuestSession();

  if (pathname.startsWith("/s/")) {
    const slug = pathname.split("/")[2];
    if (slug) {
      const decodedSlug = decodeURIComponent(slug);
      if (decodedSlug === "terra-basket" || decodedSlug === "terra-basket-demo") {
        return {
          cookieName: GUEST_COOKIE,
          cookieValue: ensuredGuest.token,
          kind: "guest" as const,
          state: mergePublicStoreState(ensuredGuest.state, buildDemoSessionState())
        };
      }

      const publicStore = await findStoreBySlug(decodedSlug);
      if (publicStore) {
        return {
          cookieName: GUEST_COOKIE,
          cookieValue: ensuredGuest.token,
          kind: "guest" as const,
          state: mergePublicStoreState(ensuredGuest.state, normalizeSessionState(publicStore.state_json))
        };
      }
    }
  }

  return {
    cookieName: GUEST_COOKIE,
    cookieValue: ensuredGuest.token,
    kind: "guest" as const,
    state: ensuredGuest.state
  };
}

export async function persistSessionState(state: SessionState) {
  await ensureSchema();
  const cookieStore = await cookies();
  const authToken = cookieStore.get(AUTH_COOKIE)?.value;
  const guestToken = cookieStore.get(GUEST_COOKIE)?.value;
  const pool = getPool();
  const nextState = sanitizeStateForStorage(state);

  if (authToken) {
    const merchantSession = await findSession(authToken);
    if (merchantSession?.kind === "merchant" && merchantSession.merchant_id && merchantSession.store_id) {
      await pool.query(
        `UPDATE sessions
         SET state_json = $2::jsonb, updated_at = NOW(), expires_at = NOW() + INTERVAL '30 days'
         WHERE token = $1`,
        [authToken, JSON.stringify(nextState)]
      );

      await pool.query(
        `UPDATE stores
         SET state_json = $2::jsonb, slug = $3, owner_email = $4, updated_at = NOW()
         WHERE id = $1`,
        [merchantSession.store_id, JSON.stringify(nextState), nextState.store.slug, nextState.store.ownerEmail || nextState.auth.email]
      );

      return { kind: "merchant" as const, state: nextState };
    }
  }

  const token = guestToken || createToken("guest");
  const existing = guestToken ? await findSession(guestToken) : null;
  if (existing) {
    await pool.query(
      `UPDATE sessions
       SET state_json = $2::jsonb, updated_at = NOW(), expires_at = NOW() + INTERVAL '30 days'
       WHERE token = $1`,
      [token, JSON.stringify(nextState)]
    );
  } else {
    await pool.query(
      `INSERT INTO sessions (token, kind, state_json)
       VALUES ($1, 'guest', $2::jsonb)`,
      [token, JSON.stringify(nextState)]
    );
  }

  return { kind: "guest" as const, token, state: nextState };
}

export async function createMerchantSession(input: {
  merchantId: string;
  storeId: string;
  state: SessionState;
}) {
  await ensureSchema();
  const token = createToken("merchant");
  const pool = getPool();
  const state = sanitizeStateForStorage(input.state);

  await pool.query(
    `INSERT INTO sessions (token, kind, merchant_id, store_id, state_json)
     VALUES ($1, 'merchant', $2, $3, $4::jsonb)`,
    [token, input.merchantId, input.storeId, JSON.stringify(state)]
  );

  return { token, state };
}

export async function destroySession(token: string) {
  await ensureSchema();
  const pool = getPool();
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

export function applyGuestCookie(response: Response, token: string) {
  response.headers.append("Set-Cookie", `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookieOptions().maxAge}`);
}

export function applyAuthCookie(response: Response, token: string) {
  response.headers.append("Set-Cookie", `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookieOptions().maxAge}`);
}

export function clearAuthCookie(response: Response) {
  response.headers.append("Set-Cookie", `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function clearGuestCookie(response: Response) {
  response.headers.append("Set-Cookie", `${GUEST_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function upsertStoreRecord(input: {
  storeId: string;
  merchantId: string | null;
  slug: string;
  ownerEmail: string;
  state: SessionState;
}) {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO stores (id, merchant_id, slug, owner_email, state_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id)
     DO UPDATE SET
       merchant_id = EXCLUDED.merchant_id,
       slug = EXCLUDED.slug,
       owner_email = EXCLUDED.owner_email,
       state_json = EXCLUDED.state_json,
       updated_at = NOW()`,
    [input.storeId, input.merchantId, input.slug, input.ownerEmail, JSON.stringify(sanitizeStateForStorage(input.state))]
  );
}
