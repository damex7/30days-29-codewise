import "server-only";
import { db, type Db } from "@/lib/db";

// SQL only: no rules here. Services decide who may call what.

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  is_demo: boolean;
  disabled_at: Date | null;
  created_at: Date;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] ?? null;
}

export async function insertUser(
  input: { email: string; passwordHash: string; role?: "user" | "admin"; isDemo?: boolean },
  conn: Db = db,
): Promise<UserRow | null> {
  const rows = await conn.query<UserRow>(
    `INSERT INTO users (email, password_hash, role, is_demo) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [input.email, input.passwordHash, input.role ?? "user", input.isDemo ?? false],
  );
  return rows[0] ?? null;
}

export async function setUserDisabled(userId: string, disabled: boolean, conn: Db = db): Promise<UserRow | null> {
  const rows = await conn.query<UserRow>(
    `UPDATE users SET disabled_at = CASE WHEN $2 THEN coalesce(disabled_at, now()) ELSE NULL END
     WHERE id = $1 AND role <> 'admin' RETURNING *`,
    [userId, disabled],
  );
  return rows[0] ?? null;
}
