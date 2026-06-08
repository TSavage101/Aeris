import { NextResponse } from "next/server";
import { applyGuestCookie, bootstrapStateForPath } from "@/lib/server/session";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pathname = searchParams.get("path") || "/";
    const freshGuest = searchParams.get("fresh") === "1";
    const result = await bootstrapStateForPath(pathname, { freshGuest });
    const response = NextResponse.json({ state: result.state, kind: result.kind });

    if (result.kind === "guest") {
      applyGuestCookie(response, result.cookieValue);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to bootstrap session state" },
      { status: 500 }
    );
  }
}
