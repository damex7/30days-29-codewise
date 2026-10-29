import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { listRuns } from "@/lib/services/runs";
import { historySearchSchema, type HistorySearch } from "@/lib/validation/history";
import { MODES, MODE_INFO, RUN_STATUSES, languageLabel } from "@/lib/constants";
import { StatusBadge, statusLabel } from "@/components/badges";
import { formatWhen } from "@/lib/format";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold text-ink">History</h1>
      <p className="mt-1 text-muted">Your past runs. Only you can see them.</p>
      <Suspense fallback={<ListSkeleton />}>
        <HistoryList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function href(f: HistorySearch, patch: Partial<HistorySearch>) {
  const next = { ...f, ...patch };
  const qs = new URLSearchParams();
  if (next.mode) qs.set("mode", next.mode);
  if (next.status) qs.set("status", next.status);
  if (next.after) qs.set("after", next.after);
  const s = qs.toString();
  return `/history${s ? `?${s}` : ""}`;
}

async function HistoryList({ searchParams }: { searchParams: PageProps<"/history">["searchParams"] }) {
  const actor = await requireUser("/history");
  const filter = historySearchSchema.parse(await searchParams);
  const { runs, next } = await listRuns(actor, filter);

  return (
    <>
      {/* A plain GET form: filters live in the URL, so they can be bookmarked and survive reloads. */}
      <form method="get" action="/history" className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-4">
        <div>
          <label htmlFor="mode" className="mb-1 block text-sm font-semibold text-ink">
            Mode
          </label>
          <select id="mode" name="mode" defaultValue={filter.mode ?? ""} className="min-h-11 rounded-md border border-line bg-page px-3 text-ink">
            <option value="">All modes</option>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_INFO[m].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-semibold text-ink">
            Outcome
          </label>
          <select id="status" name="status" defaultValue={filter.status ?? ""} className="min-h-11 rounded-md border border-line bg-page px-3 text-ink">
            <option value="">All outcomes</option>
            {RUN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-md bg-brand-btn px-5 font-semibold text-on-brand">
          Filter
        </button>
        {filter.mode || filter.status ? (
          <Link href="/history" className="min-h-11 content-center px-2 text-sm font-semibold">
            Clear filters
          </Link>
        ) : null}
      </form>

      {runs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-6 text-muted">
          {filter.mode || filter.status || filter.after ? (
            <p>No runs match these filters.</p>
          ) : (
            <p>
              No runs yet. <Link href="/workbench">Open the workbench</Link> and ask your first question.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/history/${r.id}`} className="font-semibold">
                  {MODE_INFO[r.mode].label} · {languageLabel(r.language)}
                  {r.targetLanguage ? ` → ${languageLabel(r.targetLanguage)}` : ""}
                </Link>
                <p className="truncate font-mono text-xs text-muted">
                  {r.inputText ? r.inputText.split("\n").find((l) => l.trim())?.slice(0, 90) : r.status === "blocked_secret" ? "(input not stored: contained a secret)" : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted">
                <StatusBadge status={r.status} />
                <time dateTime={r.createdAt}>{formatWhen(r.createdAt)}</time>
              </div>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Pages" className="mt-4 flex justify-between">
        {filter.after ? (
          <Link href={href(filter, { after: undefined })} className="font-semibold">
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={href(filter, { after: next })} className="font-semibold">
            Older runs →
          </Link>
        ) : null}
      </nav>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden="true">
      <div className="h-20 skeleton" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 skeleton" />
      ))}
    </div>
  );
}
