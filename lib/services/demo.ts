import "server-only";
import { randomUUID } from "node:crypto";
import { transaction } from "@/lib/db";
import { insertUser } from "@/lib/repos/users";
import { hashPassword } from "@/lib/auth/password";
import { randomToken } from "@/lib/crypto";
import { startSession } from "@/lib/auth/session";
import { hitLimit, DAY } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/constants";
import { LimitError } from "@/lib/services/errors";
import { log } from "@/lib/log";

/**
 * "Try it without signing up": an isolated throwaway account per visitor.
 * Isolated means it's a real user row, so every ownership rule applies
 * unchanged, and the visitor sees only their own demo runs. It has a small
 * daily allowance (LIMITS.DEMO_DAILY_RUNS), can't create share links, and
 * is deleted (with everything it made) by the daily cron after 24 hours.
 */
export async function startDemo(ip: string): Promise<void> {
  const limit = await hitLimit(`demo:ip:${ip}`, LIMITS.DEMO_STARTS_PER_IP_PER_DAY, DAY);
  if (!limit.ok) throw new LimitError("demo", limit.retryAfter, "Too many demo sessions from this network today. Create a free account to keep going.");
  await transaction(async (tx) => {
    const user = await insertUser(
      {
        email: `demo-${randomUUID()}@demo.codewise.invalid`, // .invalid: can never receive mail
        passwordHash: await hashPassword(randomToken()), // nobody knows it; sign-in also refuses demo users
        isDemo: true,
      },
      tx,
    );
    if (!user) throw new Error("demo user insert failed");
    await startSession(user.id, tx);
    log("demo.start", { userId: user.id });
  });
}
