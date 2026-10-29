import "server-only";
import { hashPassword, verifyPassword, burnPasswordCheck } from "@/lib/auth/password";
import { startSession, endSession } from "@/lib/auth/session";
import { findUserByEmail, insertUser } from "@/lib/repos/users";
import { recordAudit } from "@/lib/repos/audit";
import { hitLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/crypto";
import { log } from "@/lib/log";
import { LimitError } from "@/lib/services/errors";

// Messages are deliberately generic: neither sign-in nor sign-up ever says
// whether an email already has an account (no account enumeration).
export const SIGN_IN_FAILED = "That email and password don't match an account.";
export const SIGN_UP_DONE = "If that email can be registered, the account is ready. Sign in to continue.";

/** Five tries per 15 minutes per IP and per email, whichever trips first. */
async function limitSignIn(ip: string, email: string): Promise<void> {
  const window = 15 * 60;
  const [byIp, byEmail] = await Promise.all([
    hitLimit(`signin:ip:${ip}`, 20, window),
    // Keyed by a hash so the rate_limits table never holds an email.
    hitLimit(`signin:email:${sha256(email).slice(0, 32)}`, 5, window),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    throw new LimitError("signin", Math.max(byIp.retryAfter, byEmail.retryAfter), "Too many sign-in attempts. Please wait a few minutes and try again.");
  }
}

export async function signIn(email: string, password: string, ip: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await limitSignIn(ip, email);
  const user = await findUserByEmail(email);
  if (!user || user.is_demo) {
    await burnPasswordCheck(password);
    return { ok: false, message: SIGN_IN_FAILED };
  }
  if (!(await verifyPassword(password, user.password_hash))) return { ok: false, message: SIGN_IN_FAILED };
  // Only someone who knows the password learns the account is disabled.
  if (user.disabled_at) return { ok: false, message: "This account has been disabled. Contact the site admin if you think this is a mistake." };
  await startSession(user.id);
  await recordAudit(user.id, "auth.sign_in");
  log("auth.sign_in", { userId: user.id });
  return { ok: true };
}

export async function signUp(email: string, password: string, ip: string): Promise<{ message: string }> {
  const limit = await hitLimit(`signup:ip:${ip}`, 10, 3600);
  if (!limit.ok) throw new LimitError("signin", limit.retryAfter, "Too many sign-ups from this network. Try again later.");
  const created = await insertUser({ email, passwordHash: await hashPassword(password) });
  if (created) {
    await recordAudit(created.id, "auth.sign_up");
    log("auth.sign_up", { userId: created.id });
  }
  // Same answer whether or not the email was taken; no auto sign-in, so the
  // response never differs between the two cases.
  return { message: SIGN_UP_DONE };
}

export async function signOut(): Promise<void> {
  await endSession();
}
