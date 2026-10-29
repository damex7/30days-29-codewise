import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require";
import { getSnippet } from "@/lib/services/snippets";
import { getLiveShare } from "@/lib/services/shares";
import { NotFoundError } from "@/lib/services/errors";
import { languageLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { CodeBlock } from "@/components/code-block";
import { SnippetForm, SharePanel } from "@/components/snippet-forms";
import { DeleteSnippetButton } from "@/components/delete-snippet";

export const metadata: Metadata = { title: "Snippet" };

export default function SnippetPage({ params, searchParams }: PageProps<"/snippets/[id]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/snippets" className="text-sm font-semibold">
        ← Snippets
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 skeleton" aria-hidden="true" />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Detail({ params, searchParams }: Pick<PageProps<"/snippets/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const actor = await requireUser(`/snippets/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  let snippet;
  try {
    snippet = await getSnippet(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound(); // someone else's = not found
    throw error;
  }
  const live = await getLiveShare(actor, id);
  const created = (await searchParams).notice === "created";

  return (
    <article className="mt-4 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-ink">{snippet.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {languageLabel(snippet.language)} · edited {formatDate(snippet.updatedAt)}
          {snippet.sourceRunId ? (
            <>
              {" "}· saved from <Link href={`/history/${snippet.sourceRunId}`}>a run</Link>
            </>
          ) : null}
        </p>
        {created ? (
          <p role="status" className="mt-3 rounded-md border border-line bg-card p-3 text-sm font-semibold text-ink">
            Snippet created.
          </p>
        ) : null}
      </header>

      <CodeBlock code={snippet.code} label={`${languageLabel(snippet.language)} snippet`} />

      <section aria-labelledby="share-h" className="rounded-lg border border-line p-4">
        <h2 id="share-h" className="mb-3 text-xl font-bold text-ink">
          Share
        </h2>
        <SharePanel snippetId={snippet.id} live={live} canShare={!actor.isDemo} />
      </section>

      <details className="rounded-lg border border-line p-4">
        <summary className="cursor-pointer text-xl font-bold text-ink">Edit</summary>
        <div className="mt-4">
          <SnippetForm initial={snippet} />
        </div>
      </details>

      <section aria-labelledby="danger-h" className="rounded-lg border-2 border-strong p-4">
        <h2 id="danger-h" className="text-lg font-bold text-ink">
          Delete
        </h2>
        <p className="mt-1 text-sm text-muted">Deleting also kills any share link immediately. This can&apos;t be undone.</p>
        <DeleteSnippetButton id={snippet.id} />
      </section>
    </article>
  );
}
