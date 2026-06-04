import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";

async function verifyJwt(token: string) {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const { pathname } = request.nextUrl;

  // Paths that are publicly accessible
  const isAuthPage = pathname === "/login";
  const isPublicFile = pathname.startsWith("/favicon.ico") || pathname.startsWith("/_next");

  if (isPublicFile) {
    return NextResponse.next();
  }

  // If not logged in and trying to access a secure area
  if (!token) {
    if (!isAuthPage && pathname !== "/") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Verify token signature and decode payload
  const session = await verifyJwt(token);

  if (!session) {
    // Bad or tampered token — clear it and redirect to login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("auth_token");
    return response;
  }

  // If logged in and trying to access login or root page, redirect to dashboard
  if (isAuthPage || pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Super Admin route protection
  if (pathname.startsWith("/dashboard/superadmin") && session.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/api/reports/:path*",
    "/api/audit-logs/:path*",
    "/api/branches/:path*",
    "/api/admin-users/:path*",
    "/api/backup/:path*",
    "/api/cleanup/:path*",
  ],
};
