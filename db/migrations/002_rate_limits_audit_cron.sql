-- 002: rate limiting, the audit trail and scheduled-job bookkeeping.

-- Fixed-window rate limiter stored in Postgres.
-- On serverless (Vercel) every request may land on a different, short-lived
-- instance, so an in-memory counter would reset constantly and each
-- instance would count separately. One shared table is the single source
-- of truth, and the upsert below is atomic:
--   INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
--   RETURNING count
-- Two simultaneous requests can't both read "4" and both write "5".
CREATE TABLE rate_limits (
  -- e.g. 'signin:ip:1.2.3.4', 'run:min:<user id>', 'run:day:<user id>'.
  -- Never contains an email or code.
  key          text NOT NULL CHECK (char_length(key) <= 200),
  -- Start of the window this count belongs to (minute, hour or day).
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 1 CHECK (count > 0),
  -- The primary key is both the uniqueness rule the upsert relies on and
  -- its lookup index.
  PRIMARY KEY (key, window_start)
);

-- The cron deletes old windows by time.
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

-- Who did what, for security review: sign-ins, admin actions, share links.
-- meta never holds code, secrets or raw emails (lib/log.ts masks them).
CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ON DELETE SET NULL: the record of what happened outlives the account
  -- (e.g. "admin disabled a user" stays even if that admin is later deleted).
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (char_length(action) <= 64),
  target_type text CHECK (char_length(target_type) <= 32),
  target_id   text CHECK (char_length(target_id) <= 64),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Admin view lists recent events newest first.
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);

-- One row per execution of a scheduled job, so we can see it ran, how long
-- it took and what it deleted. /admin also uses it to decide whether to
-- run the daily job lazily (no successful run in the last 12 hours).
CREATE TABLE cron_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job         text NOT NULL CHECK (job IN ('daily')),
  -- How it was triggered: the Vercel schedule or a lazy run from /admin.
  trigger     text NOT NULL CHECK (trigger IN ('schedule', 'lazy', 'manual')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok          boolean,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

-- "Latest run of job X" lookups.
CREATE INDEX cron_runs_job_started_idx ON cron_runs (job, started_at DESC);
