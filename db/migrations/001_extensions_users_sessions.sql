-- 001: extensions, people and sign-in sessions.
--
-- Forward-only: once this file has been applied anywhere it is never edited.
-- A change becomes a new numbered file, so every database (yours, a
-- teammate's, production) replays exactly the same history.

-- citext: case-insensitive text, so "Ada@Example.com" and "ada@example.com"
-- are the same email for UNIQUE without remembering lower() everywhere.
CREATE EXTENSION IF NOT EXISTS citext;

-- pg_trgm: splits text into 3-letter "trigrams" ("react" -> " r", " re",
-- "rea", "eac", "act", "ct ") and scores how many two strings share.
-- That gives typo-tolerant search ("recat" still finds "react") with a GIN
-- index, without a search engine. Used by snippets (migration 004).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gen_random_uuid() is built into Postgres 13+, so no pgcrypto is needed.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE on citext: one account per email, whatever the capitalisation.
  email         citext NOT NULL UNIQUE CHECK (char_length(email) BETWEEN 3 AND 254),
  -- "scrypt$N$r$p$<salt>$<hash>": the per-user random salt and the cost
  -- parameters travel with the hash, so parameters can be raised later
  -- without breaking older passwords.
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  -- Only two roles; CHECK makes a typo like 'Admin' impossible to store.
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  -- Demo visitors ("Try it without signing up") get an isolated throwaway
  -- account; the daily cron deletes them (and, by CASCADE, their runs).
  is_demo       boolean NOT NULL DEFAULT false,
  -- Set by an admin. A disabled user can't sign in and their sessions are
  -- deleted. Kept as a timestamp, not a boolean, so we know *when*.
  disabled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- An admin is a real person: never a throwaway demo account.
  CONSTRAINT users_demo_not_admin CHECK (NOT (is_demo AND role = 'admin'))
);

-- Partial index: the cron's "demo users older than 24h" scan touches only
-- demo rows, however many real users there are.
CREATE INDEX users_demo_created_idx ON users (created_at) WHERE is_demo;

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE: a session means nothing without its user; deleting a
  -- (demo) user signs them out everywhere at once.
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Only the SHA-256 of the random cookie token is stored. If this table
  -- ever leaks (backup, log, SQL injection elsewhere), the hashes can't be
  -- replayed as cookies: SHA-256 can't be reversed, and the token has
  -- 256 bits of randomness so it can't be guessed either. UNIQUE gives the
  -- lookup index for "which session is this cookie?".
  token_hash   char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- Sliding expiry: pushed forward while the user keeps using the app.
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- "Sign out everywhere" and "disable user" delete by user_id.
CREATE INDEX sessions_user_idx ON sessions (user_id);
-- Cleanup of expired sessions scans by time.
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
