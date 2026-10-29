-- 004: the personal snippet library and read-only share links.

CREATE TABLE snippets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE: a person's library goes with their account.
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  language      text NOT NULL CHECK (language IN ('javascript', 'typescript', 'python', 'php', 'java', 'csharp', 'go', 'sql', 'html_css')),
  code          text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 20000),
  -- Plain text[]: a handful of lowercase labels per snippet. Simpler than a
  -- tags + snippet_tags join for a personal library, and a GIN index makes
  -- "has tag X" (tags @> ARRAY['x']) fast.
  tags          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 8),
  -- The run this snippet was saved from, if any (nullable: snippets can be
  -- typed in directly).
  source_run_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Target for shares' composite FK (see below).
  CONSTRAINT snippets_id_user_key UNIQUE (id, user_id),
  -- Composite FK: the source run must belong to the SAME user as the snippet.
  -- ON DELETE SET NULL (source_run_id): if the run is deleted the snippet
  -- survives and just forgets where it came from. The column list matters:
  -- a plain SET NULL would also null user_id, which is NOT NULL.
  -- (Postgres 15+; Neon runs 16/17.)
  CONSTRAINT snippets_source_run_fk FOREIGN KEY (source_run_id, user_id)
    REFERENCES runs (id, user_id) ON DELETE SET NULL (source_run_id)
);

-- "Has tag X" filters.
CREATE INDEX snippets_tags_gin ON snippets USING gin (tags);
-- Typo-tolerant title search ("authentcation" finds "Authentication helper").
CREATE INDEX snippets_title_trgm ON snippets USING gin (title gin_trgm_ops);
-- The library list: "my snippets, most recently edited first", keyset paged.
CREATE INDEX snippets_user_updated_idx ON snippets (user_id, updated_at DESC, id DESC);

CREATE TABLE shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id  uuid NOT NULL,
  user_id     uuid NOT NULL,
  -- SHA-256 of the random token in the link, never the token itself. The
  -- link is shown to the owner once; if this table leaks, nobody can turn
  -- the hashes back into working links. UNIQUE = the lookup index for /s/[token].
  token_hash  char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- NULL = never expires (until revoked).
  expires_at  timestamptz,
  -- Revoking keeps the row (an audit of "this link existed") but the link
  -- stops working at once.
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Composite FK: the share's owner must be the snippet's owner. Example:
  -- Ada (user A) tries to share Bola's snippet S by inserting
  -- (snippet_id = S, user_id = A). The pair (S, A) doesn't exist in
  -- snippets(id, user_id), so Postgres rejects the row, even if a bug in a
  -- service forgot to check ownership.
  -- ON DELETE CASCADE: deleting a snippet kills its links immediately.
  CONSTRAINT shares_snippet_owner_fk FOREIGN KEY (snippet_id, user_id)
    REFERENCES snippets (id, user_id) ON DELETE CASCADE,
  CONSTRAINT shares_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT shares_revoked_after_creation CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- At most ONE live (unrevoked) link per snippet, so "revoke" has exactly one
-- thing to revoke. Creating a new link revokes the old one in the same
-- transaction (lib/services/shares.ts).
CREATE UNIQUE INDEX shares_one_active_per_snippet ON shares (snippet_id) WHERE revoked_at IS NULL;
-- The cron deletes expired links.
CREATE INDEX shares_expires_idx ON shares (expires_at) WHERE expires_at IS NOT NULL;
