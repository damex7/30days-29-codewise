"use client";

import { useState } from "react";
import { deleteSnippetAction } from "@/app/actions/snippets";
import { SubmitButton } from "@/components/form";

/** Two-step delete: the first click asks, the second (a real form submit) deletes. */
export function DeleteSnippetButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="mt-3 min-h-11 rounded-md border-2 border-strong px-4 font-semibold text-ink">
        Delete snippet…
      </button>
    );
  }
  return (
    <form action={deleteSnippetAction.bind(null, id)} className="mt-3 flex flex-wrap items-center gap-3">
      <p className="text-sm font-semibold text-ink" role="alert">
        Delete this snippet for good?
      </p>
      <SubmitButton pending="Deleting…">Yes, delete</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="min-h-11 rounded-md px-4 font-semibold text-ink">
        Keep it
      </button>
    </form>
  );
}
