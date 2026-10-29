import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/log";

// The daily job. Every step is a "delete what's past its date" statement,
// so running it twice (the schedule plus a lazy run from /admin, or a
// retry) is harmless: the second run just finds nothing to delete.

export async function runDaily(trigger: "schedule" | "lazy" | "manual") {
  const [cron] = await db.query<{ id: string }>("INSERT INTO cron_runs (job, trigger) VALUES ('daily', $1) RETURNING id", [trigger]);
  try {
    // Demo visitors and all their runs/snippets (CASCADE) after 24 hours.
    const demo = await db.query("DELETE FROM users WHERE is_demo AND created_at < now() - interval '24 hours' RETURNING id");
    const shares = await db.query("DELETE FROM shares WHERE expires_at < now() RETURNING id");
    const sessions = await db.query("DELETE FROM sessions WHERE expires_at < now() RETURNING id");
    const limits = await db.query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days' RETURNING key");
    // A run stuck in 'pending' means its server died mid-call: close it out.
    const stuck = await db.query(
      "UPDATE runs SET status = 'error', error_code = 'abandoned', completed_at = now() WHERE status = 'pending' AND created_at < now() - interval '15 minutes' RETURNING id",
    );
    const details = { demoUsers: demo.length, expiredShares: shares.length, expiredSessions: sessions.length, oldLimitWindows: limits.length, abandonedRuns: stuck.length };
    await db.query("UPDATE cron_runs SET finished_at = now(), ok = true, details = $2 WHERE id = $1", [cron?.id ?? null, details]);
    log("cron.daily", { trigger, ...details });
    return details;
  } catch (error) {
    await db.query("UPDATE cron_runs SET finished_at = now(), ok = false WHERE id = $1", [cron?.id ?? null]).catch(() => undefined);
    throw error;
  }
}

/** /admin calls this: runs the job only if no successful run in the last 12 hours. */
export async function runDailyIfStale(): Promise<boolean> {
  const rows = await db.query("SELECT 1 FROM cron_runs WHERE job = 'daily' AND ok AND started_at > now() - interval '12 hours' LIMIT 1");
  if (rows.length) return false;
  await runDaily("lazy");
  return true;
}
