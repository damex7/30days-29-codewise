import "server-only";
import { db } from "@/lib/db";

// SQL only. Every statement is scoped by user_id; the composite FK on
// (source_run_id, user_id) means a snippet can't even point at someone
// else's run.

export interface SnippetRow {
  id: string;
  user_id: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
  source_run_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SnippetFields {
  title: string;
  language: string;
  code: string;
  tags: string[];
}

export async function insertSnippet(userId: string, f: SnippetFields, sourceRunId: string | null): Promise<SnippetRow> {
  const rows = await db.query<SnippetRow>(
    `INSERT INTO snippets (user_id, title, language, code, tags, source_run_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, f.title, f.language, f.code, f.tags, sourceRunId],
  );
  const row = rows[0];
  if (!row) throw new Error("insert failed");
  return row;
}

export async function updateSnippet(userId: string, id: string, f: SnippetFields): Promise<SnippetRow | null> {
  const rows = await db.query<SnippetRow>(
    `UPDATE snippets SET title = $3, language = $4, code = $5, tags = $6 WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, f.title, f.language, f.code, f.tags],
  );
  return rows[0] ?? null;
}

export async function deleteSnippet(userId: string, id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>("DELETE FROM snippets WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length > 0;
}

export async function findSnippet(userId: string, id: string): Promise<SnippetRow | null> {
  const rows = await db.query<SnippetRow>("SELECT * FROM snippets WHERE id = $1 AND user_id = $2", [id, userId]);
  return rows[0] ?? null;
}

export interface SnippetListFilter {
  q?: string | undefined;
  tag?: string | undefined;
  before?: { updatedAt: string; id: string } | undefined;
  limit: number;
}

/**
 * Two shapes:
 * - Browsing (no q): newest edits first, keyset-paged on (updated_at, id).
 * - Searching (q): ranked by pg_trgm similarity, top `limit` only.
 *   `title % q` is true when the trigram similarity is above pg_trgm's
 *   threshold (0.3) and can use the GIN trigram index; word_similarity
 *   catches a typo'd word inside a longer title ("debonce" in "Debounce
 *   helper"); tags match exactly or by similarity. Within one person's
 *   library Postgres may prefer the user_id index instead: both are fine
 *   at this size, and the trigram index pays off as libraries grow.
 */
export async function listSnippets(userId: string, f: SnippetListFilter): Promise<(SnippetRow & { cursor_at: string; score: number })[]> {
  return db.query<SnippetRow & { cursor_at: string; score: number }>(
    `SELECT s.*, s.updated_at::text AS cursor_at,
            CASE WHEN $2::text IS NULL THEN 0
                 ELSE greatest(similarity(s.title, $2), word_similarity($2, s.title),
                               coalesce((SELECT max(similarity(t, $2)) FROM unnest(s.tags) t), 0))
            END AS score
     FROM snippets s
     WHERE s.user_id = $1
       AND ($3::text IS NULL OR s.tags @> ARRAY[$3::text])
       AND ($2::text IS NULL
            OR s.title % $2
            OR word_similarity($2, s.title) >= 0.4
            OR s.title ILIKE '%' || $2 || '%'
            OR EXISTS (SELECT 1 FROM unnest(s.tags) t WHERE t = lower($2) OR similarity(t, $2) >= 0.4))
       AND ($2::text IS NOT NULL OR $4::timestamptz IS NULL OR (s.updated_at, s.id) < ($4::timestamptz, $5::uuid))
     ORDER BY CASE WHEN $2::text IS NULL THEN 0 ELSE 1 END,
              score DESC, s.updated_at DESC, s.id DESC
     LIMIT $6`,
    [userId, f.q ?? null, f.tag ?? null, f.before?.updatedAt ?? null, f.before?.id ?? null, f.limit],
  );
}

/** Tag cloud for the filter bar. */
export async function listTags(userId: string): Promise<{ tag: string; n: number }[]> {
  return db.query<{ tag: string; n: number }>(
    `SELECT t AS tag, count(*)::int AS n FROM snippets, unnest(tags) t WHERE user_id = $1 GROUP BY t ORDER BY n DESC, t LIMIT 30`,
    [userId],
  );
}
