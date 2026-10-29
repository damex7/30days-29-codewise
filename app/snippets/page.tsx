import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { listSnippets, listTags } from "@/lib/services/snippets";
import { snippetSearchSchema } from "@/lib/validation/snippets";
import { languageLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Snippets" };

export default function SnippetsPage({ searchParams }: PageProps<"/snippets">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink">Snippets</h1>
          <p className="mt-1 text-muted">Your personal library. Search forgives typos.</p>
        </div>
        <Link href="/snippets/new" className="inline-flex min-h-11 items-center rounded-md bg-brand-btn px-5 font-semibold text-on-brand no-underline">
          New snippet
        </Link>
      </div>
      <Suspense fallback={<div className="mt-6 h-96 skeleton" aria-hidden="true" />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Library({ searchParams }: { searchParams: PageProps<"/snippets">["searchParams"] }) {
  const actor = await requireUser("/snippets");
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = snippetSearchSchema.safeParse({ q: one(raw.q), tag: one(raw.tag), after: one(raw.after) });
  const filter: { q?: string | undefined; tag?: string | undefined; after?: string | undefined } = parsed.success ? parsed.data : {};
  const notice = one(raw.notice) === "deleted" ? "Snippet deleted." : null;
  const [{ snippets, next }, tags] = await Promise.all([listSnippets(actor, filter), listTags(actor)]);

  const tagHref = (t?: string) => {
    const qs = new URLSearchParams();
    if (filter.q) qs.set("q", filter.q);
    if (t) qs.set("tag", t);
    return `/snippets${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      {notice ? (
        <p role="status" className="mt-4 rounded-md border border-line bg-card p-3 text-sm font-semibold text-ink">
          {notice}
        </p>
      ) : null}
      <form method="get" action="/snippets" role="search" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-semibold text-ink">
            Search titles and tags
          </label>
          <input id="q" name="q" type="search" defaultValue={filter.q ?? ""} placeholder="e.g. debonce" className="block min-h-11 w-full rounded-md border border-line bg-page px-3 text-ink" />
        </div>
        {filter.tag ? <input type="hidden" name="tag" value={filter.tag} /> : null}
        <button type="submit" className="min-h-11 rounded-md bg-brand-btn px-5 font-semibold text-on-brand">
          Search
        </button>
      </form>

      {tags.length ? (
        <nav aria-label="Filter by tag" className="mt-4 flex flex-wrap gap-2">
          <Link
            href={tagHref()}
            aria-current={!filter.tag ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink no-underline aria-[current=page]:border-2 aria-[current=page]:border-strong aria-[current=page]:font-bold"
          >
            All
          </Link>
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={tagHref(t.tag)}
              aria-current={filter.tag === t.tag ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1 text-sm text-ink no-underline aria-[current=page]:border-2 aria-[current=page]:border-strong aria-[current=page]:font-bold"
            >
              #{t.tag} <span className="text-muted">({t.n})</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {snippets.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-6 text-muted">
          {filter.q || filter.tag ? <p>No snippets match. Try fewer letters or another tag.</p> : <p>No snippets yet. Save an answer from the workbench, or create one.</p>}
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {snippets.map((s) => (
            <li key={s.id} className="min-w-0 rounded-lg border border-line bg-card p-4">
              <Link href={`/snippets/${s.id}`} className="text-lg font-bold">
                {s.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                {languageLabel(s.language)} · edited {formatDate(s.updatedAt)}
              </p>
              <pre className="mt-3 overflow-hidden rounded bg-code p-3 font-mono text-xs leading-5 text-code-fg" aria-hidden="true">
                {s.code.split("\n").slice(0, 4).join("\n")}
              </pre>
              {s.tags.length ? (
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <span key={t} className="rounded border border-line px-2 py-0.5 text-xs text-ink">
                      #{t}
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {next ? (
        <p className="mt-4 text-right">
          <Link href={`/snippets?${new URLSearchParams({ ...(filter.tag ? { tag: filter.tag } : {}), after: next })}`} className="font-semibold">
            More snippets →
          </Link>
        </p>
      ) : null}
    </>
  );
}
