import "server-only";
import { neon, Pool, type PoolClient } from "@neondatabase/serverless";

// The only module that talks to Postgres. Two rules:
//  1. Parameterised queries only. SQL text and values travel separately
//     ($1, $2 ...), so pasted code full of quotes and semicolons can never
//     change the shape of a query.
//  2. Multi-step writes go through transaction(): one connection, BEGIN ...
//     COMMIT, and ROLLBACK if anything throws.

export type Row = Record<string, unknown>;
export type Param = string | number | boolean | bigint | null | Date | readonly string[] | Record<string, unknown> | readonly Record<string, unknown>[];

/** Anything that can run a query: the shared client or an open transaction. */
export interface Db {
  query<T extends object = Row>(text: string, params?: readonly Param[]): Promise<T[]>;
}

/** Postgres is unreachable (or not configured): pages show a friendly screen. */
export class DatabaseUnavailableError extends Error {
  override name = "DatabaseUnavailableError";
}

/** A Postgres error with its SQLSTATE (23505 unique, 23503 FK, 23514 check). */
export class DatabaseError extends Error {
  override name = "DatabaseError";
  readonly code: string;
  readonly constraint: string | undefined;
  constructor(message: string, code: string, constraint: string | undefined, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.constraint = constraint;
  }
}

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new DatabaseUnavailableError("DATABASE_URL is not set");
  return value;
}

function encode(params: readonly Param[]): unknown[] {
  // jsonb parameters: plain objects (and arrays of objects) go as JSON text.
  // text[] parameters (string arrays) are passed through for the driver.
  return params.map((p) => {
    if (typeof p === "bigint") return p.toString();
    if (p === null || p instanceof Date || typeof p !== "object") return p;
    if (Array.isArray(p) && p.every((v) => typeof v === "string")) return p;
    return JSON.stringify(p);
  });
}

function wrap(error: unknown): Error {
  if (error instanceof DatabaseError || error instanceof DatabaseUnavailableError) return error;
  const e = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (typeof e?.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
    return new DatabaseError(String(e.message), e.code, typeof e.constraint === "string" ? e.constraint : undefined, { cause: error });
  }
  // Next aborts in-flight fetches when a prerender finishes; let that through.
  if (error instanceof Error && /HANGING_PROMISE|prerender/i.test(error.message)) return error;
  return new DatabaseUnavailableError("The database could not be reached", { cause: error });
}

let http: ReturnType<typeof neon> | null = null;

/** One-shot queries over HTTP: no connection to hold open, ideal on serverless. */
export const db: Db = {
  async query<T extends object = Row>(text: string, params: readonly Param[] = []): Promise<T[]> {
    http ??= neon(url());
    try {
      return (await http.query(text, encode(params))) as T[];
    } catch (error) {
      throw wrap(error);
    }
  },
};

let pool: Pool | null = null;

/** Runs fn inside BEGIN/COMMIT on one pooled WebSocket connection. */
export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  pool ??= new Pool({ connectionString: url() });
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw wrap(error);
  }
  const tx: Db = {
    async query<R extends object = Row>(text: string, params: readonly Param[] = []): Promise<R[]> {
      try {
        return (await client.query(text, encode(params))).rows as R[];
      } catch (error) {
        throw wrap(error);
      }
    },
  };
  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Scripts call this so Node can exit (the pool keeps a socket open). */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

export const isUniqueViolation = (e: unknown, constraint?: string): boolean =>
  e instanceof DatabaseError && e.code === "23505" && (!constraint || e.constraint === constraint);
export const isForeignKeyViolation = (e: unknown): boolean => e instanceof DatabaseError && e.code === "23503";
