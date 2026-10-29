"use client";

import { ErrorIcon } from "@/components/form";

// Shown when a page throws (e.g. the database is unreachable). Friendly,
// no stack trace, and a retry that re-renders just this segment.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div role="alert" className="rounded-md border-4 border-double border-strong p-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <ErrorIcon />
          Something went wrong on our side
        </h1>
        <p className="mt-2 text-muted">
          We couldn&apos;t load this page. This usually means the database or the AI provider is briefly unreachable. Nothing you typed has been
          sent anywhere new.
        </p>
        <button type="button" onClick={() => retry()} className="mt-4 min-h-11 rounded-md bg-brand-btn px-5 font-semibold text-on-brand">
          Try again
        </button>
      </div>
    </div>
  );
}
