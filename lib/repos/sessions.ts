import "server-only";
import { db, type Db } from "@/lib/db";

export interface SessionUserRow {
  session_id: string;
  expires_at: Date;
  last_seen_at: Date;
  user_id: string;
  email: string;
  role: "user" | "admin";
  is_demo: boolean;
}

export async function insertSession(userId: string, tokenHash: string, expiresAt: Date, conn: Db = db): Promise<void> {
  await conn.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [userId, tokenHash, expiresAt]);
}

/** A live session for an enabled user, or nothing. Expired = not found. */
export async function findSessionUser(tokenHash: string): Promise<SessionUserRow | null> {
  const rows = await db.query<SessionUserRow>(
    `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
            u.id AS user_id, u.email, u.role, u.is_demo
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function extendSession(sessionId: string, expiresAt: Date): Promise<void> {
  await db.query("UPDATE sessions SET expires_at = $2, last_seen_at = now() WHERE id = $1", [sessionId, expiresAt]);
}

export async function deleteSessionByHash(tokenHash: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteSessionsForUser(userId: string, conn: Db = db): Promise<void> {
  await conn.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}
