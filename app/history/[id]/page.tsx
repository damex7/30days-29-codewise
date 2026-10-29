import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require";
import { getRun } from "@/lib/services/runs";
import { getFeedback } from "@/lib/services/feedback";
import { NotFoundError } from "@/lib/services/errors";
import { MODE_INFO, languageLabel } from "@/lib/constants";
import { formatMicroUsd } from "@/lib/ai/pricing";
import { formatWhen } from "@/lib/format";
import { RunResult } from "@/components/run-result";
import { StatusBadge } from "@/components/badges";
import { CodeBlock } from "@/components/code-block";
import { SaveSnippet, Feedback } from "@/components/run-actions";

export const metadata: Metadata = { title: "Run" };

export default function RunPage({ params }: PageProps<"/history/[id]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/history" className="text-sm font-semibold">
        ← History
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 skeleton" aria-hidden="true" />}>
        <RunDetail params={params} />
      </Suspense>
    </div>
  );
}

async function RunDetail({ params }: { params: PageProps<"/history/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireUser(`/history/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  let run;
  try {
    run = await getRun(actor, id);
  } catch (error) {
    // Someone else's run looks exactly like a missing one.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const feedback = await getFeedback(actor, id);

  return (
    <article className="mt-4 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">
          {MODE_INFO[run.mode].label} · {languageLabel(run.language)}
          {run.targetLanguage ? ` → ${languageLabel(run.targetLanguage)}` : ""}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <StatusBadge status={run.status} />
          <time dateTime={run.createdAt}>{formatWhen(run.createdAt)}</time>
          <span>
            {run.provider === "mock" ? "Mock provider" : run.provider === "none" ? "Not sent to any provider" : run.model}
          </span>
          <span>
            {run.inputTokens.toLocaleString("en-US")} in / {run.outputTokens.toLocaleString("en-US")} out tokens · est. paid cost {formatMicroUsd(run.costMicroUsd)}
          </span>
          {run.level ? <span>Level: {run.level}</span> : null}
          {run.framework ? <span>Framework: {run.framework}</span> : null}
        </div>
      </header>

      {run.inputText ? (
        <section aria-labelledby="input-h">
          <h2 id="input-h" className="mb-2 text-lg font-bold text-ink">
            {run.mode === "generate" ? "Your request" : "Your code"}
          </h2>
          <CodeBlock code={run.inputText} label={run.mode === "generate" ? "Request" : "Input"} />
          {run.inputExtra ? (
            <div className="mt-3">
              <CodeBlock code={run.inputExtra} label="Error message" />
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="answer-h">
        <h2 id="answer-h" className="mb-2 text-lg font-bold text-ink">
          Answer
        </h2>
        <RunResult run={run} input={run.inputText} />
      </section>

      {run.output && run.output.type !== "blocked" ? (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <SaveSnippet runId={run.id} defaultTitle={`${MODE_INFO[run.mode].label}: ${languageLabel(run.language)}`} />
          <Feedback runId={run.id} initial={feedback?.rating ?? null} />
        </div>
      ) : null}
    </article>
  );
}
