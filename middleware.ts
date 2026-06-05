import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MERCHANT_PATHS = ["/dashboard", "/store", "/products", "/orders", "/payouts", "/settings"];

function isMerchantPath(pathname: string) {
  return MERCHANT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get("aeris_auth_session")?.value;

  if (isMerchantPath(pathname) && !authCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/store/:path*", "/products/:path*", "/orders/:path*", "/payouts/:path*", "/settings/:path*"]
};

