import "server-only";
import { db, type Db } from "@/lib/db";

/** meta must hold ids and counts only: never code, secrets or emails. */
export async function recordAudit(
  actorId: string | null,
  action: string,
  target: { type: string; id: string } | null = null,
  meta: Record<string, string | number | boolean> = {},
  conn: Db = db,
): Promise<void> {
  await conn.query(
    "INSERT INTO audit_events (actor_id, action, target_type, target_id, meta) VALUES ($1, $2, $3, $4, $5)",
    [actorId, action, target?.type ?? null, target?.id ?? null, meta],
  );
}
