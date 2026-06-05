import { NextResponse } from "next/server";
import { bankCodeFromName, koraRequest } from "@/lib/server/kora";

export async function POST(request: Request) {
  try {
    const { bankName, accountNumber } = await request.json() as { bankName: string; accountNumber: string };
    if (!bankName || !accountNumber) {
      return NextResponse.json({ error: "Bank name and account number are required" }, { status: 400 });
    }

    const bankCode = bankCodeFromName(bankName);
    
    const response = await koraRequest<{ account_name: string }>("/merchant/api/v1/misc/banks/resolve", {
      method: "POST",
      body: JSON.stringify({
        bank: bankCode,
        account: accountNumber,
        currency: "NGN"
      })
    });

    return NextResponse.json({
      accountName: response.data.account_name
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify bank account" },
      { status: 500 }
    );
  }
}
