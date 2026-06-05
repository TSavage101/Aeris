import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { koraRequest } from "@/lib/server/kora";
import { AUTH_COOKIE, GUEST_COOKIE } from "@/lib/server/session";
import { persistCheckoutSession } from "@/lib/server/payments";
import type { CheckoutDetails } from "@/lib/aeris";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      reference: string;
      amount: number;
      customer: { name: string; email: string };
      store: { id: string; slug: string };
      cart: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
      delivery: CheckoutDetails;
      totals: {
        subtotal: number;
        logisticsFee: number;
        platformFee: number;
        merchantEarnings: number;
        total: number;
      };
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

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(GUEST_COOKIE)?.value || cookieStore.get(AUTH_COOKIE)?.value || null;
    await persistCheckoutSession({
      reference: payload.data.reference,
      guestToken,
      snapshot: {
        storeId: body.store.id,
        storeSlug: body.store.slug,
        cart: body.cart,
        delivery: body.delivery,
        subtotal: body.totals.subtotal,
        logisticsFee: body.totals.logisticsFee,
        platformFee: body.totals.platformFee,
        merchantEarnings: body.totals.merchantEarnings,
        total: body.totals.total,
        customer: body.customer
      }
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
