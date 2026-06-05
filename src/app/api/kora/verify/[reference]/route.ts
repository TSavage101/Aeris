import { NextResponse } from "next/server";
import { koraRequest } from "@/lib/server/kora";

export async function GET(_: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await context.params;
    const payload = await koraRequest<{ status: string; amount?: string; currency?: string }>(`/merchant/api/v1/charges/${reference}`, {
      method: "GET"
    });

    const rawStatus = payload.data.status;
    const normalizedStatus = rawStatus === "success" ? "paid" : rawStatus === "failed" ? "failed" : "pending";

    return NextResponse.json({
      status: normalizedStatus,
      rawStatus,
      amount: payload.data.amount ? Number(payload.data.amount) : undefined,
      currency: payload.data.currency
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify Kora charge" },
      { status: 500 }
    );
  }
}
