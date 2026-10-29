import "server-only";
import { db } from "@/lib/db";

// Admin analytics, all aggregated in SQL. Privacy choice: none of these
// queries select runs.input_text, runs.output or snippets.code. An admin
// can see that Ada made 12 review runs costing $0.0004, never WHAT she
// pasted. (Admins see a snippet's code only through a share link its
// owner chose to create, like anyone else.)

export interface UsageRow {
  days: number;
  runs: number;
  input_tokens: number;
  output_tokens: number;
  cost_micro_usd: string;
  avg_latency_ms: number | null;
  fallback: number;
  rate_limited: number;
  blocked_secret: number;
  invalid_output: number;
}

export async function usageWindows(): Promise<UsageRow[]> {
  return db.query<UsageRow>(
    `SELECT w.days,
            count(r.id)::int AS runs,
            coalesce(sum(r.input_tokens), 0)::int AS input_tokens,
            coalesce(sum(r.output_tokens), 0)::int AS output_tokens,
            coalesce(sum(r.estimated_cost_micro_usd), 0)::text AS cost_micro_usd,
            round(avg(r.latency_ms))::int AS avg_latency_ms,
            count(*) FILTER (WHERE r.status = 'fallback_mock')::int AS fallback,
            count(*) FILTER (WHERE r.status = 'rate_limited')::int AS rate_limited,
            count(*) FILTER (WHERE r.status = 'blocked_secret')::int AS blocked_secret,
            count(*) FILTER (WHERE r.status = 'invalid_output')::int AS invalid_output
     FROM (VALUES (7), (30)) AS w(days)
     LEFT JOIN runs r ON r.created_at > now() - make_interval(days => w.days)
     GROUP BY w.days ORDER BY w.days`,
  );
}

export async function outcomesByStatus(): Promise<{ status: string; n: number; pct: number }[]> {
  return db.query(
    `SELECT status, count(*)::int AS n, round(100.0 * count(*) / sum(count(*)) OVER (), 1)::float AS pct
     FROM runs WHERE created_at > now() - interval '30 days'
     GROUP BY status ORDER BY n DESC`,
  );
}

export async function topModesAndLanguages(): Promise<{ kind: "mode" | "language"; name: string; n: number; cost_micro_usd: string }[]> {
  return db.query(
    `(SELECT 'mode' AS kind, mode AS name, count(*)::int AS n, sum(estimated_cost_micro_usd)::text AS cost_micro_usd
      FROM runs WHERE created_at > now() - interval '30 days' GROUP BY mode)
     UNION ALL
     (SELECT 'language', language, count(*)::int, sum(estimated_cost_micro_usd)::text
      FROM runs WHERE created_at > now() - interval '30 days' GROUP BY language)
     ORDER BY kind, n DESC`,
  );
}

export async function feedbackSummary(): Promise<{ total: number; down: number; down_pct: number | null }> {
  const rows = await db.query<{ total: number; down: number; down_pct: number | null }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE rating = 'down')::int AS down,
            round(100.0 * count(*) FILTER (WHERE rating = 'down') / nullif(count(*), 0), 1)::float AS down_pct
     FROM feedback WHERE created_at > now() - interval '30 days'`,
  );
  return rows[0] ?? { total: 0, down: 0, down_pct: null };
}

/** Thumbs-down reasons with the run's mode and language: no code, no user. */
export async function recentDownReasons(): Promise<{ reason: string; mode: string; language: string; created_at: Date }[]> {
  return db.query(
    `SELECT f.reason, r.mode, r.language, f.created_at
     FROM feedback f JOIN runs r ON r.id = f.run_id
     WHERE f.rating = 'down' AND f.reason IS NOT NULL
     ORDER BY f.created_at DESC LIMIT 12`,
  );
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: "user" | "admin";
  disabled_at: Date | null;
  created_at: Date;
  runs_30d: number;
  cost_30d: string;
  last_run_at: Date | null;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  return db.query<AdminUserRow>(
    `SELECT u.id, u.email, u.role, u.disabled_at, u.created_at,
            count(r.id) FILTER (WHERE r.created_at > now() - interval '30 days')::int AS runs_30d,
            coalesce(sum(r.estimated_cost_micro_usd) FILTER (WHERE r.created_at > now() - interval '30 days'), 0)::text AS cost_30d,
            max(r.created_at) AS last_run_at
     FROM users u LEFT JOIN runs r ON r.user_id = u.id
     WHERE NOT u.is_demo
     GROUP BY u.id ORDER BY u.created_at LIMIT 100`,
  );
}

export async function demoCount(): Promise<number> {
  const rows = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE is_demo");
  return rows[0]?.n ?? 0;
}

export async function lastCronRun(): Promise<{ started_at: Date; ok: boolean | null; trigger: string; details: Record<string, number> } | null> {
  const rows = await db.query<{ started_at: Date; ok: boolean | null; trigger: string; details: Record<string, number> }>(
    "SELECT started_at, ok, trigger, details FROM cron_runs WHERE job = 'daily' ORDER BY started_at DESC LIMIT 1",
  );
  return rows[0] ?? null;
}
