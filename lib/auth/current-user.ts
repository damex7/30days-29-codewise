import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { sha256 } from "@/lib/crypto";
import { findSessionUser, extendSession } from "@/lib/repos/sessions";
import { SESSION_COOKIE, sessionExpiry } from "@/lib/auth/session";

/** The acting user every service receives as its first argument. */
export interface Actor {
  id: string;
  email: string;
  role: "user" | "admin";
  isDemo: boolean;
}

const HOUR_MS = 3_600_000;

/**
 * Who is making this request, or null. React cache() de-duplicates the
 * lookup within one request (layout + page + action share it) but never
 * across requests, so revoking a session takes effect on the next click.
 *
 * Sliding expiry: if the session was last extended over an hour ago, push
 * expires_at forward another 7 days. Active users stay signed in; an
 * abandoned cookie dies 7 days after its last use. (The cookie's own
 * Max-Age is refreshed by proxy.ts, because pages can't set cookies.)
 */
export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await findSessionUser(sha256(token));
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > HOUR_MS) {
    await extendSession(row.session_id, sessionExpiry());
  }
  return { id: row.user_id, email: row.email, role: row.role, isDemo: row.is_demo };
});
