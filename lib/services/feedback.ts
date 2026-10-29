import "server-only";
import type { Actor } from "@/lib/auth/current-user";
import { db, isForeignKeyViolation } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";

/**
 * Thumbs up/down on your own run. One per person per run (upsert). The
 * composite FK (run_id, user_id) -> runs(id, user_id) makes the database
 * refuse feedback on someone else's run; we report that as not found.
 */
export async function setFeedback(actor: Actor, runId: string, rating: "up" | "down", reason: string | undefined): Promise<void> {
  try {
    await db.query(
      `INSERT INTO feedback (run_id, user_id, rating, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT feedback_run_user_key DO UPDATE SET rating = EXCLUDED.rating, reason = EXCLUDED.reason`,
      [runId, actor.id, rating, rating === "down" ? (reason?.trim() || null) : null],
    );
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new NotFoundError();
    throw error;
  }
}

export async function getFeedback(actor: Actor, runId: string): Promise<{ rating: "up" | "down"; reason: string | null } | null> {
  const rows = await db.query<{ rating: "up" | "down"; reason: string | null }>("SELECT rating, reason FROM feedback WHERE run_id = $1 AND user_id = $2", [runId, actor.id]);
  return rows[0] ?? null;
}
