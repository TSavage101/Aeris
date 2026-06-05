import { NextResponse } from "next/server";
import { koraRequest } from "@/lib/server/kora";
import { finalizePaidCheckout, findCheckoutSession, markCheckoutFailed } from "@/lib/server/payments";

export async function GET(_: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await context.params;
    const payload = await koraRequest<{ status: string; amount?: string; currency?: string }>(`/merchant/api/v1/charges/${reference}`, {
      method: "GET"
    });

    const rawStatus = payload.data.status;
    const normalizedStatus = rawStatus === "success" ? "paid" : rawStatus === "failed" ? "failed" : "pending";
    const finalization = normalizedStatus === "paid"
      ? await finalizePaidCheckout(reference, rawStatus)
      : normalizedStatus === "failed"
        ? await markCheckoutFailed(reference, rawStatus)
        : null;

    return NextResponse.json({
      status: normalizedStatus,
      rawStatus,
      amount: payload.data.amount ? Number(payload.data.amount) : undefined,
      currency: payload.data.currency,
      orderReference: finalization && "order" in finalization ? finalization.order.reference : undefined
    });
  } catch (error) {
    const { reference } = await context.params;
    const checkout = await findCheckoutSession(reference);
    if (checkout?.status === "paid" && checkout.order_reference) {
      return NextResponse.json({
        status: "paid",
        rawStatus: checkout.raw_status || "success",
        orderReference: checkout.order_reference
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify Kora charge" },
      { status: 500 }
    );
  }
}
