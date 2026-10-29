"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { saveRunSchema, shareSchema, snippetSchema } from "@/lib/validation/snippets";
import { createSnippet, deleteSnippet, saveRunAsSnippet, updateSnippet } from "@/lib/services/snippets";
import { createShareLink, revokeShareLink } from "@/lib/services/shares";
import { ForbiddenError, InputError, NotFoundError } from "@/lib/services/errors";
import { DatabaseUnavailableError } from "@/lib/db";

// Thin Server Actions: parse with Zod, call a service, shape the response.

const DB_DOWN = "We couldn't reach the database. Nothing was lost; please try again.";

function known(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof NotFoundError) return { message: "That snippet or run no longer exists.", values };
  if (error instanceof ForbiddenError || error instanceof InputError) return { message: error.message, values };
  if (error instanceof DatabaseUnavailableError) return { message: DB_DOWN, values };
  throw error;
}

export type SaveState = FormState & { snippetId?: string };

export async function saveRunAsSnippetAction(_prev: SaveState, data: FormData): Promise<SaveState> {
  const actor = await requireUser();
  const values = formValues(data);
  const parsed = saveRunSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    const s = await saveRunAsSnippet(actor, parsed.data.runId, parsed.data.title, parsed.data.tags);
    return { ok: true, message: "Saved to your snippets.", snippetId: s.id };
  } catch (error) {
    return known(error, values);
  }
}

export async function createSnippetAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireUser("/snippets/new");
  const values = formValues(data);
  const parsed = snippetSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  let id: string;
  try {
    id = (await createSnippet(actor, parsed.data)).id;
  } catch (error) {
    return known(error, values);
  }
  redirect(`/snippets/${id}?notice=created`);
}

const idSchema = z.uuid();

export async function updateSnippetAction(id: string, _prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireUser("/snippets");
  const values = formValues(data);
  if (!idSchema.safeParse(id).success) return { message: "That snippet doesn't exist." };
  const parsed = snippetSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await updateSnippet(actor, id, parsed.data);
  } catch (error) {
    return known(error, values);
  }
  refresh();
  return { ok: true, message: "Changes saved.", values };
}

export async function deleteSnippetAction(id: string): Promise<void> {
  const actor = await requireUser("/snippets");
  if (!idSchema.safeParse(id).success) redirect("/snippets");
  try {
    await deleteSnippet(actor, id);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  redirect("/snippets?notice=deleted");
}

export type ShareState = FormState & { url?: string };

export async function createShareAction(_prev: ShareState, data: FormData): Promise<ShareState> {
  const actor = await requireUser("/snippets");
  const parsed = shareSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const days = parsed.data.expiresInDays === "never" ? null : Number(parsed.data.expiresInDays);
  try {
    const { url } = await createShareLink(actor, parsed.data.snippetId, days);
    refresh();
    return { ok: true, url, message: "Link created. Copy it now: for your security we only store a fingerprint of it, so it can't be shown again." };
  } catch (error) {
    return known(error);
  }
}

export async function revokeShareAction(_prev: ShareState, data: FormData): Promise<ShareState> {
  const actor = await requireUser("/snippets");
  const parsed = z.object({ snippetId: z.uuid() }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { message: "That snippet doesn't exist." };
  try {
    await revokeShareLink(actor, parsed.data.snippetId);
    refresh();
    return { ok: true, message: "Link revoked. Anyone opening it now gets “not found”." };
  } catch (error) {
    return known(error);
  }
}
