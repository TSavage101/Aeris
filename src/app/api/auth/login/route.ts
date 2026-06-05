import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { applyAuthCookie, createMerchantSession, findMerchantByEmail, findStoreByMerchantId } from "@/lib/server/session";
import { normalizeSessionState } from "@/lib/server/state";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json() as { email: string; password: string };
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const merchant = await findMerchantByEmail(normalizedEmail);
    if (!merchant) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, merchant.password_hash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    const store = await findStoreByMerchantId(merchant.id);
    if (!store) {
      return NextResponse.json({ error: "This merchant account does not have a store yet" }, { status: 404 });
    }

    const nextState = normalizeSessionState(store.state_json);
    nextState.auth = {
      email: merchant.email,
      password: "",
      loggedIn: true
    };

    const session = await createMerchantSession({
      merchantId: merchant.id,
      storeId: store.id,
      state: nextState
    });

    const response = NextResponse.json({ state: session.state });
    applyAuthCookie(response, session.token);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to log in" },
      { status: 500 }
    );
  }
}

