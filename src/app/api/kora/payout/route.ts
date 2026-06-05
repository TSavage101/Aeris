import { NextResponse } from "next/server";
import { bankCodeFromName, koraRequest } from "@/lib/server/kora";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      reference: string;
      amount: number;
      accountNumber: string;
      bankName: string;
      accountName: string;
      customerEmail: string;
    };

    const payload = await koraRequest<{ reference: string; status: string; message?: string }>("/merchant/api/v1/transactions/disburse", {
      method: "POST",
      body: JSON.stringify({
        reference: body.reference,
        destination: {
          type: "bank_account",
          amount: Number(body.amount.toFixed(2)),
          currency: "NGN",
          narration: "Aeris merchant payout",
          bank_account: {
            bank: bankCodeFromName(body.bankName),
            account: body.accountNumber
          },
          customer: {
            name: body.accountName,
            email: body.customerEmail
          }
        }
      })
    });

    const rawStatus = payload.data.status;
    const normalizedStatus = rawStatus === "success" ? "paid" : rawStatus === "failed" ? "failed" : "processing";

    return NextResponse.json({
      reference: payload.data.reference,
      status: normalizedStatus,
      message: payload.data.message || payload.message
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to request payout from Kora" },
      { status: 500 }
    );
  }
}
