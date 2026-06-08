import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

// The museum is public by default: homepage, galleries, exhibitions, and the
// Library (Cortex chat) need no account. Only the community-curation surfaces
// below require a session — everything else passes through.
const PROTECTED_PREFIXES = [
  "/admin",
  "/profile",
  "/upload",
  "/api/admin",
  "/api/me",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const hasCookie = req.cookies.has(SESSION_COOKIE);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + (search || ""));
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|_next/data|.*\\..*).*)"],
};
