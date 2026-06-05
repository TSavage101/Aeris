import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/lib/server/db";
import { AUTH_COOKIE, findSession } from "@/lib/server/session";

export async function GET() {
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

    const { rows: stores } = await pool.query(
      "SELECT id, merchant_id, slug, owner_email, state_json, created_at FROM stores"
    );

    const { rows: merchants } = await pool.query(
      "SELECT id, email, store_id, created_at FROM merchants"
    );

    const { rows: auditLogs } = await pool.query(
      "SELECT id, store_id, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 500"
    );

    return NextResponse.json({
      stores,
      merchants,
      auditLogs
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch admin data" },
      { status: 500 }
    );
  }
}
