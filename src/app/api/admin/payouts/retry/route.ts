import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/lib/server/db";
import { AUTH_COOKIE, findSession } from "@/lib/server/session";
import { logAuditEvent } from "@/lib/server/audit";
import { normalizeSessionState } from "@/lib/server/state";
import { bankCodeFromName, koraRequest } from "@/lib/server/kora";

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

    const { storeId, payoutId } = await request.json() as { storeId: string; payoutId: string };
    if (!storeId || !payoutId) {
      return NextResponse.json({ error: "Store ID and Payout ID are required" }, { status: 400 });
    }

    const { rows: storeRows } = await pool.query(
      "SELECT state_json, slug FROM stores WHERE id = $1",
      [storeId]
    );
    if (storeRows.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const stateJson = normalizeSessionState(storeRows[0].state_json);
    const payout = stateJson.payouts.find((p) => p.id === payoutId);
    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }

    // Call Kora to disburse
    const newReference = `PAYOUT_RETRY_${Date.now().toString(36).toUpperCase()}`;
    const payload = await koraRequest<{ reference: string; status: string; message?: string }>("/merchant/api/v1/transactions/disburse", {
      method: "POST",
      body: JSON.stringify({
        reference: newReference,
        destination: {
          type: "bank_account",
          amount: Number(payout.amount.toFixed(2)),
          currency: "NGN",
          narration: "Aeris merchant payout retry",
          bank_account: {
            bank: bankCodeFromName(stateJson.draft.bankName),
            account: stateJson.draft.accountNumber
          },
          customer: {
            name: stateJson.draft.accountName,
            email: stateJson.store.ownerEmail || stateJson.auth.email
          }
        }
      })
    });

    const rawStatus = payload.data.status;
    const normalizedStatus = rawStatus === "success" ? "paid" : rawStatus === "failed" ? "failed" : "processing";

    payout.status = normalizedStatus;
    payout.koraReference = payload.data.reference;

    await pool.query(
      "UPDATE stores SET state_json = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [storeId, JSON.stringify(stateJson)]
    );

    await logAuditEvent(
      storeId,
      "admin_payout_retry",
      `Admin retried payout ${payoutId} (New Kora Ref: ${payload.data.reference}, Status: ${normalizedStatus})`
    );

    return NextResponse.json({ success: true, status: normalizedStatus, reference: payload.data.reference });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to retry payout" },
      { status: 500 }
    );
  }
}
