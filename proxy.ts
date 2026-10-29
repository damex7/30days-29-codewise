import { NextResponse, type NextRequest } from "next/server";

// Runs before matching requests. Two small jobs, no database access:
// 1. Sliding session cookie: pages can't set cookies, so on each page
//    navigation we re-issue the session cookie with a fresh Max-Age.
//    (The database expiry is extended in getCurrentUser.)
// 2. Signed-out visitors to app pages go to /sign-in?next=..., which saves
//    a render. The real check is still getCurrentUser() in every service.

const SESSION_COOKIE = "cw_session";
const PROTECTED = ["/workbench", "/history", "/snippets", "/admin"];

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  if (!token && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (token && request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86_400,
    });
  }
  return response;
}

export const config = {
  // Skip static files, images and API routes.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|txt)$).*)"],
};
