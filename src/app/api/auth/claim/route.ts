import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { SessionState } from "@/lib/server/state";
import { ensureSchema, getPool } from "@/lib/server/db";
import { applyAuthCookie, clearGuestCookie, createMerchantSession, findMerchantByEmail, findStoreBySlug, upsertStoreRecord } from "@/lib/server/session";
import { normalizeSessionState, sanitizeStateForStorage } from "@/lib/server/state";
import { logAuditEvent } from "@/lib/server/audit";

export async function POST(request: Request) {
  try {
    const { email, password, slug, state } = await request.json() as {
      email: string;
      password: string;
      slug: string;
      state: SessionState;
    };

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedSlug = slug.trim().toLowerCase();

    if (!normalizedEmail || !password.trim() || !normalizedSlug) {
      return NextResponse.json({ error: "Email, password, and slug are required" }, { status: 400 });
    }

    await ensureSchema();
    const existingMerchant = await findMerchantByEmail(normalizedEmail);
    if (existingMerchant) {
      return NextResponse.json({ error: "That email is already attached to another merchant account" }, { status: 409 });
    }

    const existingStore = await findStoreBySlug(normalizedSlug);
    if (existingStore) {
      return NextResponse.json({ error: "This slug is already taken" }, { status: 409 });
    }

    const merchantId = `merchant_${randomUUID().slice(0, 8)}`;
    const storeId = state.store.id || `store_${randomUUID().slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const nextState = normalizeSessionState({
      ...state,
      store: {
        ...state.store,
        id: storeId,
        slug: normalizedSlug,
        ownerEmail: normalizedEmail,
        published: true
      },
      draft: {
        ...state.draft,
        leadEmail: normalizedEmail
      },
      auth: {
        email: normalizedEmail,
        password: "",
        loggedIn: true
      },
      activity: [`Published ${normalizedSlug}.aeris.store`, ...(state.activity || [])]
    });

    const pool = getPool();
    await pool.query(
      `INSERT INTO merchants (id, email, password_hash, store_id)
       VALUES ($1, $2, $3, $4)`,
      [merchantId, normalizedEmail, passwordHash, storeId]
    );

    await upsertStoreRecord({
      storeId,
      merchantId,
      slug: normalizedSlug,
      ownerEmail: normalizedEmail,
      state: sanitizeStateForStorage(nextState)
    });

    await logAuditEvent(storeId, "merchant_signup_claim", `Merchant ${normalizedEmail} signed up and claimed store ${normalizedSlug}`);

    const session = await createMerchantSession({
      merchantId,
      storeId,
      state: nextState
    });

    const response = NextResponse.json({ state: session.state });
    clearGuestCookie(response);
    applyAuthCookie(response, session.token);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to claim store" },
      { status: 500 }
    );
  }
}

