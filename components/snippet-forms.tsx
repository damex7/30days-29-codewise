"use client";

import { useActionState } from "react";
import { createSnippetAction, updateSnippetAction, createShareAction, revokeShareAction, type ShareState } from "@/app/actions/snippets";
import { ErrorSummary, Field, SubmitButton, inputClass } from "@/components/form";
import { LANGUAGES } from "@/lib/constants";
import type { FormState } from "@/lib/forms";
import { formatDate } from "@/lib/format";

const LABELS = { title: "Title", language: "Language", code: "Code", tags: "Tags" };

interface Initial {
  id?: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
}

export function SnippetForm({ initial }: { initial?: Initial }) {
  const action = initial?.id ? updateSnippetAction.bind(null, initial.id) : createSnippetAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = state.values;
  return (
    <form action={formAction} noValidate>
      <ErrorSummary errors={state.errors} message={state.ok ? undefined : state.message} labels={LABELS} />
      {state.ok && state.message ? (
        <p role="status" className="mb-4 rounded-md border border-line bg-card p-3 text-sm font-semibold text-ink">
          {state.message}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[2fr_1fr]">
        <Field id="title" label="Title" error={state.errors?.title}>
          {(a) => <input {...a} defaultValue={v?.title ?? initial?.title ?? ""} className={inputClass} />}
        </Field>
        <Field id="language" label="Language" error={state.errors?.language}>
          {(a) => (
            <select {...a} defaultValue={v?.language ?? initial?.language ?? "javascript"} className={inputClass}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field id="tags" label="Tags" hint="Comma-separated, up to 8. Example: utils, frontend" error={state.errors?.tags}>
        {(a) => <input {...a} defaultValue={v?.tags ?? initial?.tags.join(", ") ?? ""} className={inputClass} />}
      </Field>
      <Field id="code" label="Code" error={state.errors?.code}>
        {(a) => (
          <textarea {...a} rows={14} spellCheck={false} defaultValue={v?.code ?? initial?.code ?? ""} className={`${inputClass} font-mono text-[13px] leading-6`} />
        )}
      </Field>
      <SubmitButton pending="Saving…">{initial?.id ? "Save changes" : "Create snippet"}</SubmitButton>
    </form>
  );
}

export function SharePanel({ snippetId, live, canShare }: { snippetId: string; live: { createdAt: string; expiresAt: string | null } | null; canShare: boolean }) {
  const [created, create] = useActionState<ShareState, FormData>(createShareAction, {});
  const [revoked, revoke] = useActionState<ShareState, FormData>(revokeShareAction, {});
  if (!canShare) {
    return <p className="text-sm text-muted">Share links need a full account (demo accounts can&apos;t publish links).</p>;
  }
  return (
    <div className="space-y-4">
      {created.url ? (
        <div role="status" className="rounded-md border-2 border-strong p-3">
          <p className="text-sm font-semibold text-ink">{created.message}</p>
          <label htmlFor="share-url" className="mt-2 block text-sm font-semibold text-ink">
            Read-only link
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input id="share-url" readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-xs sm:flex-1`} />
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(created.url ?? "").catch(() => undefined)}
              className="min-h-11 rounded-md bg-brand-btn px-4 text-sm font-semibold text-on-brand"
            >
              Copy link
            </button>
          </div>
        </div>
      ) : null}
      {revoked.message ? (
        <p role="status" className="text-sm font-semibold text-ink">
          {revoked.message}
        </p>
      ) : null}
      {created.message && !created.url ? (
        <p role="alert" className="text-sm font-semibold text-ink">
          {created.message}
        </p>
      ) : null}

      {live ? (
        <p className="text-sm text-ink">
          A link is active (created {formatDate(live.createdAt)}, {live.expiresAt ? `expires ${formatDate(live.expiresAt)}` : "never expires"}).
        </p>
      ) : (
        <p className="text-sm text-muted">Not shared. Nobody but you can see this snippet.</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form action={create} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="snippetId" value={snippetId} />
          <div>
            <label htmlFor="expiresInDays" className="mb-1 block text-sm font-semibold text-ink">
              Link expires
            </label>
            <select id="expiresInDays" name="expiresInDays" defaultValue="7" className="min-h-11 rounded-md border border-line bg-page px-3 text-ink">
              <option value="1">In 1 day</option>
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="never">Never</option>
            </select>
          </div>
          <SubmitButton pending="Creating…">{live ? "Replace link" : "Create share link"}</SubmitButton>
        </form>
        {live ? (
          <form action={revoke}>
            <input type="hidden" name="snippetId" value={snippetId} />
            <button type="submit" className="min-h-11 rounded-md border-2 border-strong px-4 font-semibold text-ink">
              Revoke link
            </button>
          </form>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Anyone with the link can read this one snippet (not your name, email or other snippets). Creating a new link revokes the old one.
      </p>
    </div>
  );
}
