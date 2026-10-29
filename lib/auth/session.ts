import "server-only";
import { cookies } from "next/headers";
import { randomToken, sha256 } from "@/lib/crypto";
import { insertSession, deleteSessionByHash } from "@/lib/repos/sessions";
import type { Db } from "@/lib/db";

// Sessions: the browser holds a random token in a cookie; the database
// holds only its SHA-256 (sessions.token_hash). See migration 001 for why.

export const SESSION_COOKIE = "cw_session";
export const SESSION_DAYS = 7;
const DAY_MS = 86_400_000;

export const sessionExpiry = (): Date => new Date(Date.now() + SESSION_DAYS * DAY_MS);

export const cookieOptions = {
  httpOnly: true, // page JavaScript (and any injected script) can't read it
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: "lax" as const, // not sent on cross-site POSTs: basic CSRF defence
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

/** Creates the row and sets the cookie. Call from a Server Action or route handler. */
export async function startSession(userId: string, conn?: Db): Promise<void> {
  const token = randomToken();
  await insertSession(userId, sha256(token), sessionExpiry(), conn);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
}

/** Sign-out deletes the row, so a copied cookie stops working immediately. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByHash(sha256(token));
  jar.delete(SESSION_COOKIE);
}
