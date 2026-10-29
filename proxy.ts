import { NextResponse, type NextRequest } from "next/server";
import { shareLinkIsLive } from "@/lib/services/shares";

// Runs before matching requests. Three small jobs:
// 1. Sliding session cookie: pages can't set cookies, so on each page
//    navigation we re-issue the session cookie with a fresh Max-Age.
//    (The database expiry is extended in getCurrentUser.)
// 2. Signed-out visitors to app pages go to /sign-in?next=..., which saves
//    a render. The real check is still getCurrentUser() in every service.
// 3. Dead share links (/s/<token>: unknown, revoked, expired) get a real
//    HTTP 404. The page streams, and once streaming starts the status is
//    fixed at 200, so the check has to happen here, before rendering. It's
//    one indexed EXISTS query; the page still re-checks and renders.

const SESSION_COOKIE = "cw_session";
const PROTECTED = ["/workbench", "/history", "/snippets", "/admin"];

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  const share = /^\/s\/([^/]+)$/.exec(pathname);
  // If the database is down, let the page handle it rather than guess "gone".
  if (share?.[1] && !(await shareLinkIsLive(share[1]).catch(() => true))) {
    // An unmatched path renders the app's not-found page with a 404.
    return NextResponse.rewrite(new URL("/share-not-found", request.url), { status: 404 });
  }

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
