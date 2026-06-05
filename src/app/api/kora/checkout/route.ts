import { NextResponse } from "next/server";
import { koraRequest } from "@/lib/server/kora";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      reference: string;
      amount: number;
      customer: { name: string; email: string };
      metadata?: Record<string, string>;
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const payload = await koraRequest<{ checkout_url: string; reference: string }>("/merchant/api/v1/charges/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: Math.round(body.amount),
        currency: "NGN",
        reference: body.reference,
        customer: body.customer,
        notification_url: `${appUrl}/api/kora/webhook`,
        metadata: body.metadata
      })
    });

    return NextResponse.json({
      checkoutUrl: payload.data.checkout_url,
      reference: payload.data.reference
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to initialize Kora checkout" },
      { status: 500 }
    );
  }
}
