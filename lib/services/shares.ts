import "server-only";
import type { Actor } from "@/lib/auth/current-user";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { findSnippet } from "@/lib/repos/snippets";
import { replaceShare, revokeShares, findLiveShare, findSharedSnippet } from "@/lib/repos/shares";
import { recordAudit } from "@/lib/repos/audit";
import { ForbiddenError, NotFoundError } from "@/lib/services/errors";

// Read-only share links.
// The link carries a random 256-bit token; the database stores only its
// SHA-256 (shares.token_hash). Consequences:
// - the full link is shown to the owner ONCE, when created (we can't show
//   it again: we don't have it). Lost it? Create a new one, which revokes
//   the old;
// - a leaked shares table can't be turned into working links.

export interface ShareInfo {
  createdAt: string;
  expiresAt: string | null;
}

export async function createShareLink(actor: Actor, snippetId: string, expiresInDays: number | null): Promise<{ url: string; share: ShareInfo }> {
  // Demo accounts can't publish links: a throwaway account hosting public
  // pages is an abuse magnet.
  if (actor.isDemo) throw new ForbiddenError("Share links need a full account.");
  if (!(await findSnippet(actor.id, snippetId))) throw new NotFoundError();
  const token = randomToken();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
  // (The composite FK would also refuse a snippet that isn't this user's.)
  const row = await replaceShare(actor.id, snippetId, sha256(token), expiresAt);
  await recordAudit(actor.id, "share.create", { type: "snippet", id: snippetId }, { expiresInDays: expiresInDays ?? 0 });
  return {
    url: `${env().APP_URL.replace(/\/$/, "")}/s/${token}`,
    share: { createdAt: new Date(row.created_at).toISOString(), expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null },
  };
}

export async function revokeShareLink(actor: Actor, snippetId: string): Promise<void> {
  if (!(await findSnippet(actor.id, snippetId))) throw new NotFoundError();
  const n = await revokeShares(actor.id, snippetId);
  if (n) await recordAudit(actor.id, "share.revoke", { type: "snippet", id: snippetId });
}

export async function getLiveShare(actor: Actor, snippetId: string): Promise<ShareInfo | null> {
  const row = await findLiveShare(actor.id, snippetId);
  return row ? { createdAt: new Date(row.created_at).toISOString(), expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null } : null;
}

export interface PublicSnippet {
  title: string;
  language: string;
  code: string;
  tags: string[];
  updatedAt: string;
}

/** Public, no actor. Returns only the snippet content; unknown, revoked or expired -> not found. */
export async function getSharedSnippet(token: string): Promise<PublicSnippet> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new NotFoundError();
  const row = await findSharedSnippet(sha256(token));
  if (!row) throw new NotFoundError();
  return { title: row.title, language: row.language, code: row.code, tags: row.tags, updatedAt: new Date(row.updated_at).toISOString() };
}
