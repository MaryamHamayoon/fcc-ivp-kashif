import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateSatisfied } from "@/lib/auth/gate";
import { getAuthSecret, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Request gate (Next 16 proxy, Node.js runtime): optional site passcode first, then a valid
 * session for everything except the sign-in page. API routes get 401 JSON instead of a redirect.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const secret = getAuthSecret();
  const target = encodeURIComponent(pathname + search);

  const gated = await gateSatisfied(req.cookies.get(GATE_COOKIE)?.value, process.env.SITE_PASSCODE, secret);
  if (!gated) {
    if (pathname === "/login") return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "gated" }, { status: 401 });
    return NextResponse.redirect(new URL(`/login?gate=1&next=${target}`, req.url));
  }
  if (pathname === "/login") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token, secret) : null;
  if (!user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const response = NextResponse.redirect(new URL(`/login?next=${target}`, req.url));
    if (token) response.cookies.delete(SESSION_COOKIE); // stale or tampered: drop it
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand|map/|api/health|favicon.ico|robots.txt).*)"],
};
