import "server-only";
import { db, type Db } from "@/lib/db";

// Fixed-window counter in Postgres (table rate_limits, migration 002).
// Works on serverless because every instance shares the same table, and
// the INSERT ... ON CONFLICT DO UPDATE ... RETURNING is one atomic
// statement: concurrent requests each get their own, correct count.

export interface LimitResult {
  ok: boolean;
  count: number;
  limit: number;
  /** Seconds until the current window ends. */
  retryAfter: number;
}

export async function hitLimit(key: string, limit: number, windowSeconds: number, conn: Db = db): Promise<LimitResult> {
  const rows = await conn.query<{ count: number; retry_after: number }>(
    `INSERT INTO rate_limits AS r (key, window_start)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2::float8) * $2::float8))
     ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
     RETURNING r.count,
               ceil(extract(epoch FROM (r.window_start + make_interval(secs => $2::float8) - now())))::int AS retry_after`,
    [key, windowSeconds],
  );
  const row = rows[0];
  const count = row?.count ?? limit + 1;
  return { ok: count <= limit, count, limit, retryAfter: Math.max(1, row?.retry_after ?? windowSeconds) };
}

/** Reads a counter without incrementing it (for "N runs left today"). */
export async function peekLimit(key: string, windowSeconds: number): Promise<number> {
  const rows = await db.query<{ count: number }>(
    `SELECT count FROM rate_limits
     WHERE key = $1 AND window_start = to_timestamp(floor(extract(epoch FROM now()) / $2::float8) * $2::float8)`,
    [key, windowSeconds],
  );
  return rows[0]?.count ?? 0;
}

export const MINUTE = 60;
export const DAY = 86_400;
