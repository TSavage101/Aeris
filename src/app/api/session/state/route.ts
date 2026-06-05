import { NextResponse } from "next/server";
import type { SessionState } from "@/lib/server/state";
import { applyGuestCookie, persistSessionState } from "@/lib/server/session";

export async function POST(request: Request) {
  try {
    const { state } = await request.json() as { state: SessionState };
    const result = await persistSessionState(state);
    const response = NextResponse.json({ state: result.state, kind: result.kind });

    if (result.kind === "guest" && "token" in result) {
      applyGuestCookie(response, result.token);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to persist session state" },
      { status: 500 }
    );
  }
}

