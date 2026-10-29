// Applies db/migrations/NNN_name.sql in order, once each.
//
//   npm run db:migrate
//
// - Files are numbered so every database applies them in the same order.
// - Each file runs inside its own transaction together with the row that
//   records it in schema_migrations: it either fully applies and is
//   recorded, or leaves no trace at all.
// - Files already recorded are skipped, so running this twice is safe.
// - The first failure stops the run: later files never build on a broken one.
//
// Never edit a migration after it has been applied: the database that ran
// the old version won't run it again, so the two databases silently drift
// apart. Fix mistakes with a new, higher-numbered file instead.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "db", "migrations");
// The Pool uses Neon's WebSocket protocol: one real connection, so BEGIN and
// COMMIT wrap the whole file (the one-shot HTTP driver can't do that).
const pool = new Pool({ connectionString: url });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const done = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const files = (await readdir(dir)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    process.stdout.write(`applying ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("ok");
      applied++;
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(applied ? `Applied ${applied} migration(s).` : "Database is up to date.");
} finally {
  client.release();
  await pool.end();
}
