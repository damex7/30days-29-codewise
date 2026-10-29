import "server-only";
import type { Actor } from "@/lib/auth/current-user";
import { isForeignKeyViolation } from "@/lib/db";
import * as repo from "@/lib/repos/snippets";
import { findRunForUser } from "@/lib/repos/runs";
import { recordAudit } from "@/lib/repos/audit";
import { NotFoundError, InputError } from "@/lib/services/errors";
import type { SnippetInput } from "@/lib/validation/snippets";
import { decodeCursor, encodeCursor } from "@/lib/cursor";

// Snippet library rules. Acting user first; a snippet that isn't yours is
// "not found", exactly like one that doesn't exist.

export interface SnippetView {
  id: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
  sourceRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

const view = (r: repo.SnippetRow): SnippetView => ({
  id: r.id,
  title: r.title,
  language: r.language,
  code: r.code,
  tags: r.tags,
  sourceRunId: r.source_run_id,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function createSnippet(actor: Actor, input: SnippetInput): Promise<SnippetView> {
  return view(await repo.insertSnippet(actor.id, input, null));
}

export async function getSnippet(actor: Actor, id: string): Promise<SnippetView> {
  const row = await repo.findSnippet(actor.id, id);
  if (!row) throw new NotFoundError();
  return view(row);
}

export async function updateSnippet(actor: Actor, id: string, input: SnippetInput): Promise<SnippetView> {
  const row = await repo.updateSnippet(actor.id, id, input);
  if (!row) throw new NotFoundError();
  return view(row);
}

export async function deleteSnippet(actor: Actor, id: string): Promise<void> {
  if (!(await repo.deleteSnippet(actor.id, id))) throw new NotFoundError();
  await recordAudit(actor.id, "snippet.delete", { type: "snippet", id });
}

/** Turn a finished run into a snippet: the code it produced (or the code it was about). */
export async function saveRunAsSnippet(actor: Actor, runId: string, title: string, tags: string[]): Promise<SnippetView> {
  const run = await findRunForUser(actor.id, runId);
  if (!run) throw new NotFoundError();
  const out = run.output;
  let code: string | null = null;
  let language = run.language;
  if (out?.type === "generate" || out?.type === "tests") code = out.data.code;
  else if (out?.type === "convert") {
    code = out.data.code;
    language = run.target_language ?? run.language;
  } else if (out?.type === "fix") code = out.data.correctedCode;
  else if (run.mode !== "generate") code = run.input_text;
  if (!code?.trim()) throw new InputError("This run has no code to save.");
  try {
    return view(await repo.insertSnippet(actor.id, { title, language, code: code.slice(0, 20_000), tags }, run.id));
  } catch (error) {
    // The composite FK refuses a run that isn't this user's.
    if (isForeignKeyViolation(error)) throw new NotFoundError();
    throw error;
  }
}

export async function listSnippets(actor: Actor, f: { q?: string | undefined; tag?: string | undefined; after?: string | undefined }) {
  const limit = 20;
  const before = f.q ? undefined : decodeCursor(f.after);
  const rows = await repo.listSnippets(actor.id, { q: f.q, tag: f.tag, before: before ? { updatedAt: before.at, id: before.id } : undefined, limit: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    snippets: page.map(view),
    next: !f.q && rows.length > limit && last ? encodeCursor(last.cursor_at, last.id) : null,
  };
}

export async function listTags(actor: Actor) {
  return repo.listTags(actor.id);
}
