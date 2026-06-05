import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildInitialSessionState } from "@/lib/server/state";
import { AUTH_COOKIE, GUEST_COOKIE, applyGuestCookie, clearAuthCookie, createGuestSession, destroySession } from "@/lib/server/session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get(AUTH_COOKIE)?.value;
    const guestToken = cookieStore.get(GUEST_COOKIE)?.value;

    if (authToken) {
      await destroySession(authToken);
    }

    if (guestToken) {
      await destroySession(guestToken);
    }

    const guestSession = await createGuestSession(buildInitialSessionState());
    const response = NextResponse.json({ state: guestSession.state });
    clearAuthCookie(response);
    applyGuestCookie(response, guestSession.token);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to log out" },
      { status: 500 }
    );
  }
}

