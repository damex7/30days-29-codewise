import "server-only";
import { db, transaction } from "@/lib/db";

export interface ShareRow {
  id: string;
  snippet_id: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
}

/**
 * Revoke any live link for the snippet and create the new one in ONE
 * transaction (the partial unique index allows only one live link).
 */
export async function replaceShare(userId: string, snippetId: string, tokenHash: string, expiresAt: Date | null): Promise<ShareRow> {
  return transaction(async (tx) => {
    await tx.query("UPDATE shares SET revoked_at = now() WHERE snippet_id = $1 AND user_id = $2 AND revoked_at IS NULL", [snippetId, userId]);
    const rows = await tx.query<ShareRow>(
      `INSERT INTO shares (snippet_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)
       RETURNING id, snippet_id, created_at, expires_at, revoked_at`,
      [snippetId, userId, tokenHash, expiresAt],
    );
    const row = rows[0];
    if (!row) throw new Error("share insert failed");
    return row;
  });
}

export async function revokeShares(userId: string, snippetId: string): Promise<number> {
  const rows = await db.query<{ id: string }>(
    "UPDATE shares SET revoked_at = now() WHERE snippet_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id",
    [snippetId, userId],
  );
  return rows.length;
}

export async function findLiveShare(userId: string, snippetId: string): Promise<ShareRow | null> {
  const rows = await db.query<ShareRow>(
    `SELECT id, snippet_id, created_at, expires_at, revoked_at FROM shares
     WHERE snippet_id = $1 AND user_id = $2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [snippetId, userId],
  );
  return rows[0] ?? null;
}

export interface PublicSnippetRow {
  title: string;
  language: string;
  code: string;
  tags: string[];
  updated_at: Date;
}

/**
 * The public view. Selects ONLY the snippet's content columns: no user_id,
 * no email, no ids, nothing about the owner's other data. A revoked or
 * expired link simply matches nothing.
 */
export async function findSharedSnippet(tokenHash: string): Promise<PublicSnippetRow | null> {
  const rows = await db.query<PublicSnippetRow>(
    `SELECT s.title, s.language, s.code, s.tags, s.updated_at
     FROM shares sh JOIN snippets s ON s.id = sh.snippet_id AND s.user_id = sh.user_id
     WHERE sh.token_hash = $1 AND sh.revoked_at IS NULL AND (sh.expires_at IS NULL OR sh.expires_at > now())`,
    [tokenHash],
  );
  return rows[0] ?? null;
}
