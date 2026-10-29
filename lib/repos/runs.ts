import "server-only";
import { db, type Db } from "@/lib/db";
import type { StoredOutput } from "@/lib/ai/schemas";

// SQL only. Every query that reads a run filters by user_id: there is no
// "get run by id" without an owner, so a missing check can't leak a run.

export interface RunRow {
  id: string;
  user_id: string;
  mode: string;
  language: string;
  target_language: string | null;
  level: string | null;
  framework: string | null;
  input_chars: number;
  input_text: string | null;
  input_extra: string | null;
  output: StoredOutput | null;
  output_kind: "structured" | "text" | null;
  status: string;
  error_code: string | null;
  provider: string;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number | null;
  estimated_cost_micro_usd: string;
  client_request_id: string;
  created_at: Date;
  completed_at: Date | null;
}

export interface NewRun {
  userId: string;
  clientRequestId: string;
  mode: string;
  language: string;
  targetLanguage: string | null;
  level: string | null;
  framework: string | null;
  inputHash: string;
  inputChars: number;
  inputText: string | null;
  inputExtra: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  status: "pending" | "blocked_secret";
  output: StoredOutput | null;
}

/**
 * INSERT ... ON CONFLICT (user_id, client_request_id) DO NOTHING: if the same
 * submission arrives twice (double tap, retry), the second insert returns
 * no row and the caller re-reads the first one instead of calling the model.
 */
export async function insertRun(r: NewRun, conn: Db = db): Promise<RunRow | null> {
  const rows = await conn.query<RunRow>(
    `INSERT INTO runs (user_id, client_request_id, mode, language, target_language, level, framework,
                       input_hash, input_chars, input_text, input_extra, provider, model, prompt_version,
                       status, output, output_kind, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, CASE WHEN $15 = 'pending' THEN NULL ELSE now() END)
     ON CONFLICT ON CONSTRAINT runs_user_request_key DO NOTHING
     RETURNING *`,
    [
      r.userId, r.clientRequestId, r.mode, r.language, r.targetLanguage, r.level, r.framework,
      r.inputHash, r.inputChars, r.inputText, r.inputExtra, r.provider, r.model, r.promptVersion,
      r.status, r.output, r.output ? (r.output.type === "text" ? "text" : "structured") : null,
    ],
  );
  return rows[0] ?? null;
}

export async function findRunByRequestId(userId: string, clientRequestId: string): Promise<RunRow | null> {
  const rows = await db.query<RunRow>("SELECT * FROM runs WHERE user_id = $1 AND client_request_id = $2", [userId, clientRequestId]);
  return rows[0] ?? null;
}

export async function findRunForUser(userId: string, runId: string): Promise<RunRow | null> {
  const rows = await db.query<RunRow>("SELECT * FROM runs WHERE id = $1 AND user_id = $2", [runId, userId]);
  return rows[0] ?? null;
}

export interface RunResult {
  status: string;
  output: StoredOutput | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costMicroUsd: number;
  errorCode: string | null;
}

/** Only a pending run can be finished, so a run is never finished twice. */
export async function finishRun(userId: string, runId: string, r: RunResult): Promise<RunRow | null> {
  const rows = await db.query<RunRow>(
    `UPDATE runs SET status = $3, output = $4, output_kind = $5, provider = $6, model = $7,
                     input_tokens = $8, output_tokens = $9, latency_ms = $10,
                     estimated_cost_micro_usd = $11, error_code = $12, completed_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [
      runId, userId, r.status, r.output, r.output ? (r.output.type === "text" ? "text" : "structured") : null,
      r.provider, r.model, r.inputTokens, r.outputTokens, r.latencyMs, r.costMicroUsd, r.errorCode,
    ],
  );
  return rows[0] ?? null;
}

export interface RunListFilter {
  mode?: string | undefined;
  status?: string | undefined;
  /** Keyset cursor: the (created_at, id) of the last row on the previous page. */
  before?: { createdAt: string; id: string } | undefined;
  limit: number;
}

/**
 * Keyset pagination: "rows strictly older than the last one I saw", using
 * the (user_id, created_at DESC, id DESC) index. Unlike OFFSET, the
 * database jumps straight to the cursor instead of reading and throwing
 * away every earlier row, and new runs arriving between page loads can't
 * shift rows across pages (no duplicates, no gaps). id breaks ties when
 * two runs share a created_at.
 */
export async function listRunsForUser(userId: string, f: RunListFilter): Promise<(RunRow & { cursor_at: string })[]> {
  // cursor_at is created_at as exact text: a JS Date would drop Postgres's
  // microseconds, and a cursor rounded to milliseconds can skip rows.
  return db.query<RunRow & { cursor_at: string }>(
    `SELECT *, created_at::text AS cursor_at FROM runs
     WHERE user_id = $1
       AND ($2::text IS NULL OR mode = $2)
       AND ($3::text IS NULL OR status = $3)
       AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
     ORDER BY created_at DESC, id DESC
     LIMIT $6`,
    [userId, f.mode ?? null, f.status ?? null, f.before?.createdAt ?? null, f.before?.id ?? null, f.limit],
  );
}
