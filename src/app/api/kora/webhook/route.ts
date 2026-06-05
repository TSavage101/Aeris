import { NextResponse } from "next/server";
import { finalizePaidCheckout, markCheckoutFailed, verifyKoraWebhookSignature } from "@/lib/server/payments";

type KoraWebhookPayload = {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number | string;
    currency?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-korapay-signature");

  if (!verifyKoraWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ received: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as KoraWebhookPayload;
    const reference = payload.data?.reference;
    const event = payload.event || "";
    const rawStatus = payload.data?.status || "";

    if (!reference) {
      return NextResponse.json({ received: true, ignored: true });
    }

    if (event === "charge.success" || rawStatus === "success") {
      const result = await finalizePaidCheckout(reference, rawStatus || "success");
      return NextResponse.json({
        received: true,
        status: "paid",
        orderReference: result?.order.reference
      });
    }

    if (event === "charge.failed" || rawStatus === "failed") {
      await markCheckoutFailed(reference, rawStatus || "failed");
      return NextResponse.json({ received: true, status: "failed" });
    }

    return NextResponse.json({ received: true, ignored: true, event });
  } catch (error) {
    return NextResponse.json(
      { received: false, error: error instanceof Error ? error.message : "Unable to process webhook" },
      { status: 500 }
    );
  }
}

