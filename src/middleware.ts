import { NextRequest, NextResponse } from "next/server";

const PASSWORD = "87tUE3x6rLVWes7U66NT";

export function middleware(request: NextRequest) {
  // Allow public assets
  const path = request.nextUrl.pathname;
  if (path === "/widget.js" || path.startsWith("/_next") || path.startsWith("/api") || path.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const auth = request.cookies.get("orion-auth")?.value;
  if (auth === PASSWORD) return NextResponse.next();

  // Check query param for login
  const pw = request.nextUrl.searchParams.get("pw");
  if (pw === PASSWORD) {
    const url = new URL(request.nextUrl.pathname, request.url);
    const res = NextResponse.redirect(url);
    res.cookies.set("orion-auth", PASSWORD, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  return new NextResponse(
    `<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;height:100vh;align-items:center;justify-content:center">
      <form method="get" style="text-align:center">
        <h2>🔒 OrionChat Admin</h2>
        <input name="pw" type="password" placeholder="Password" style="padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;margin:12px 0;display:block;width:240px" autofocus />
        <button style="padding:12px 24px;border-radius:8px;background:#10b981;color:#fff;border:none;cursor:pointer">Enter</button>
      </form>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widget\\.js).*)"],
};
