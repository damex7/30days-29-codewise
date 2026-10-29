import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSharedSnippet } from "@/lib/services/shares";
import { NotFoundError } from "@/lib/services/errors";
import { languageLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { CodeBlock } from "@/components/code-block";

// Public, read-only. Shows exactly one snippet's title, language, tags and
// code: never the owner's name, email or any other data. noindex keeps
// shared links out of search engines; the token never appears in Referer
// headers (next.config.ts sets no-referrer for /s/*).
export const metadata: Metadata = {
  title: "Shared snippet",
  robots: { index: false, follow: false },
};

export default function SharedSnippetPage({ params }: PageProps<"/s/[token]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<div className="h-96 skeleton" aria-hidden="true" />}>
        <Shared params={params} />
      </Suspense>
    </div>
  );
}

async function Shared({ params }: { params: PageProps<"/s/[token]">["params"] }) {
  const { token } = await params;
  let snippet;
  try {
    snippet = await getSharedSnippet(token);
  } catch (error) {
    if (error instanceof NotFoundError) notFound(); // unknown, revoked or expired
    throw error;
  }
  return (
    <article className="space-y-4">
      <p className="text-sm text-muted">Shared read-only snippet</p>
      <h1 className="text-3xl font-bold text-ink">{snippet.title}</h1>
      <p className="text-sm text-muted">
        {languageLabel(snippet.language)} · updated {formatDate(snippet.updatedAt)}
        {snippet.tags.length ? ` · ${snippet.tags.map((t) => `#${t}`).join(" ")}` : ""}
      </p>
      <CodeBlock code={snippet.code} label={`${languageLabel(snippet.language)} snippet`} />
      <p className="text-sm text-muted">
        Read it and test it before you use it. <Link href="/">What is Codewise?</Link>
      </p>
    </article>
  );
}
