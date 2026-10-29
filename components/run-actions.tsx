"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveRunAsSnippetAction, type SaveState } from "@/app/actions/snippets";
import { feedbackAction } from "@/app/actions/feedback";
import { Field, SubmitButton, inputClass } from "@/components/form";
import type { FormState } from "@/lib/forms";

// Actions under every finished answer: save it as a snippet, and rate it.

export function SaveSnippet({ runId, defaultTitle }: { runId: string; defaultTitle: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<SaveState, FormData>(saveRunAsSnippetAction, {});
  if (state.ok && state.snippetId) {
    return (
      <p role="status" className="text-sm text-ink">
        {state.message} <Link href={`/snippets/${state.snippetId}`}>Open snippet</Link>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-10 rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-card">
        Save as snippet
      </button>
    );
  }
  return (
    <form action={action} className="w-full rounded-lg border border-line bg-card p-4" noValidate>
      <input type="hidden" name="runId" value={runId} />
      {state.message ? (
        <p role="alert" className="mb-3 text-sm font-semibold text-ink">
          {state.message}
        </p>
      ) : null}
      <Field id={`title-${runId}`} label="Title" error={state.errors?.title}>
        {(a) => <input {...a} name="title" defaultValue={state.values?.title ?? defaultTitle} className={inputClass} />}
      </Field>
      <Field id={`tags-${runId}`} label="Tags (comma-separated, optional)" error={state.errors?.tags}>
        {(a) => <input {...a} name="tags" defaultValue={state.values?.tags ?? ""} placeholder="e.g. utils, frontend" className={inputClass} />}
      </Field>
      <div className="flex gap-2">
        <SubmitButton pending="Saving…">Save snippet</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-md px-4 text-sm font-semibold text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

const REASONS = ["Wrong or misleading", "Missed a real problem", "Too vague", "Ignored my language/level", "Code doesn't fit my question"];

export function Feedback({ runId, initial }: { runId: string; initial?: "up" | "down" | null }) {
  const [state, action] = useActionState<FormState, FormData>(feedbackAction, {});
  const [choice, setChoice] = useState<"up" | "down" | null>(initial ?? null);
  return (
    <div className="w-full">
      <form action={action} className="flex flex-wrap items-center gap-2" aria-label="Rate this answer">
        <input type="hidden" name="runId" value={runId} />
        <span className="text-sm text-muted">Was this helpful?</span>
        <button
          type="submit"
          name="rating"
          value="up"
          aria-pressed={choice === "up"}
          onClick={() => setChoice("up")}
          className="min-h-10 rounded-md border border-line px-3 text-sm font-semibold text-ink aria-pressed:border-2 aria-pressed:border-strong aria-pressed:bg-brand-soft"
        >
          <span aria-hidden="true">👍 </span>Yes
        </button>
        <button
          type="button"
          aria-pressed={choice === "down"}
          aria-expanded={choice === "down"}
          onClick={() => setChoice("down")}
          className="min-h-10 rounded-md border border-line px-3 text-sm font-semibold text-ink aria-pressed:border-2 aria-pressed:border-strong aria-pressed:bg-brand-soft"
        >
          <span aria-hidden="true">👎 </span>No
        </button>
      </form>
      {choice === "down" && !(state.ok && state.message?.includes("improve")) ? (
        <form action={action} className="mt-3 rounded-lg border border-line bg-card p-3">
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="rating" value="down" />
          <Field id={`reason-${runId}`} label="What went wrong? (optional, don't include code or personal details)">
            {(a) => (
              <>
                <input {...a} name="reason" list={`reasons-${runId}`} maxLength={300} className={inputClass} />
                <datalist id={`reasons-${runId}`}>
                  {REASONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <SubmitButton pending="Sending…">Send feedback</SubmitButton>
        </form>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-2 text-sm text-ink">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
