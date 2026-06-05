import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/lib/server/db";
import { AUTH_COOKIE, findSession } from "@/lib/server/session";
import { logAuditEvent } from "@/lib/server/audit";
import { normalizeSessionState } from "@/lib/server/state";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;
    const session = await findSession(token);
    if (!session || session.kind !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();
    const { rows: merchantRows } = await pool.query(
      "SELECT email FROM merchants WHERE id = $1",
      [session.merchant_id]
    );
    const email = merchantRows[0]?.email;
    if (email !== "admin@aeris.store") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { storeId, suspend } = await request.json() as { storeId: string; suspend: boolean };
    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    const { rows: storeRows } = await pool.query(
      "SELECT state_json, slug FROM stores WHERE id = $1",
      [storeId]
    );
    if (storeRows.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const stateJson = normalizeSessionState(storeRows[0].state_json);
    stateJson.store.suspended = suspend;

    await pool.query(
      "UPDATE stores SET state_json = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [storeId, JSON.stringify(stateJson)]
    );

    const action = suspend ? "admin_store_suspend" : "admin_store_unsuspend";
    const details = suspend
      ? `Admin suspended store ${storeRows[0].slug}`
      : `Admin unsuspended store ${storeRows[0].slug}`;
    await logAuditEvent(storeId, action, details);

    return NextResponse.json({ success: true, suspended: suspend });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to toggle store suspension" },
      { status: 500 }
    );
  }
}
