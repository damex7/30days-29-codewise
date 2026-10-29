"use client";

import { CodeBlock } from "@/components/code-block";
import { DiffView } from "@/components/diff-view";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { ErrorIcon } from "@/components/form";
import { languageLabel } from "@/lib/constants";
import type { StoredOutput, ReviewFinding } from "@/lib/ai/schemas";

// Renders a finished run's output, whatever its shape. Used by the
// workbench and by /history/[id]. Nothing here trusts the output beyond
// what Zod already checked on the server.

export interface ResultRun {
  id: string;
  mode: string;
  language: string;
  targetLanguage: string | null;
  status: string;
  provider: string;
  model: string;
  output: StoredOutput | null;
  errorCode: string | null;
}

const ERROR_TEXT: Record<string, string> = {
  timeout: "The AI provider took too long to answer, so we stopped waiting. Your input is still here. Try again, or shorten the code.",
  rate_limited: "The AI provider's free-tier limit was reached. Try again in a minute.",
  error: "The AI provider returned an error. Nothing was charged; try again shortly.",
};

const ORDER = { error: 0, warning: 1, info: 2 } as const;

function Finding({ f, code }: { f: ReviewFinding; code: string | null }) {
  const lines = f.startLine === f.endLine ? `Line ${f.startLine}` : `Lines ${f.startLine}-${f.endLine}`;
  const excerpt = code
    ? code
        .split("\n")
        .slice(f.startLine - 1, f.endLine)
        .join("\n")
    : null;
  return (
    <li className={`rounded-lg bg-page p-4 ${f.severity === "error" ? "border-4 border-double border-strong" : f.severity === "warning" ? "border-2 border-strong" : "border border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={f.severity} />
        <span className="font-mono text-xs text-muted">{lines}</span>
      </div>
      <h4 className="mt-2 text-base font-bold text-ink">{f.title}</h4>
      <p className="mt-1 whitespace-pre-wrap text-ink">{f.explanation}</p>
      {excerpt ? (
        <div className="mt-3">
          <CodeBlock code={excerpt} label={lines} startLine={f.startLine} copy={false} maxHeight="12rem" />
        </div>
      ) : null}
      {f.suggestedFix ? (
        <div className="mt-3">
          <CodeBlock code={f.suggestedFix} label="Suggested fix" maxHeight="14rem" />
        </div>
      ) : null}
    </li>
  );
}

function Notes({ title, notes }: { title: string; notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div>
      <h4 className="text-sm font-bold text-ink">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-6 text-ink">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function RunResult({ run, input }: { run: ResultRun; input: string | null }) {
  const out = run.output;
  const mockLabel =
    run.provider === "mock" ? (
      <p className="flex items-center gap-2 rounded-md border-2 border-dashed border-strong p-3 text-sm text-ink">
        <strong>Mock answer.</strong>
        {run.status === "fallback_mock"
          ? "The real AI provider was rate-limited, so this placeholder came from the built-in mock. It is not real analysis."
          : "No AI provider is configured, so this placeholder came from the built-in mock. It is not real analysis."}
      </p>
    ) : null;

  if (!out) {
    return (
      <div role="alert" className="rounded-md border-4 border-double border-strong p-4">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
          <ErrorIcon /> <StatusBadge status={run.status} />
        </h3>
        <p className="mt-2 text-ink">{ERROR_TEXT[run.status] ?? "No answer was produced. Your input is still here; try again."}</p>
      </div>
    );
  }

  switch (out.type) {
    case "text":
      return (
        <div className="space-y-3">
          {out.reason === "unstructured" ? (
            <p className="rounded-md border-2 border-strong p-3 text-sm text-ink">
              <strong>Unstructured answer.</strong> The model&apos;s reply didn&apos;t match the expected format{run.mode === "review" || run.mode === "fix" ? ", even after one repair attempt" : ""}, so
              it&apos;s shown as raw text. Line numbers and findings in it have not been checked.
            </p>
          ) : out.reason === "refused" ? (
            <p className="rounded-md border-2 border-strong p-3 text-sm text-ink">
              <strong>Declined.</strong> The assistant chose not to help with this request.
            </p>
          ) : out.reason === "interrupted" ? (
            <p className="rounded-md border border-line p-3 text-sm text-ink">
              <strong>Stopped early.</strong> This is the part that arrived before generation stopped.
            </p>
          ) : null}
          {mockLabel}
          <div className="code-panel rounded-lg border border-code-line bg-code p-4 text-code-fg">
            <div tabIndex={0} role="region" aria-label="Answer text (scrollable)" className="max-h-[32rem] overflow-auto">
              <p className="font-mono text-[13px] leading-6 whitespace-pre-wrap">{out.text}</p>
            </div>
          </div>
        </div>
      );
    case "blocked":
      return (
        <div role="alert" className="rounded-md border-4 border-double border-strong p-4 text-ink">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ErrorIcon /> Not sent: possible secrets found
          </h3>
          <ul className="mt-2 list-disc pl-6">
            {out.findings.map((f, i) => (
              <li key={i}>
                {f.where === "details" ? "Error/details box" : "Code"} line {f.line}: {f.label}
              </li>
            ))}
          </ul>
        </div>
      );
    case "explain":
      return (
        <div className="space-y-4">
          {mockLabel}
          <p className="text-lg text-ink">{out.data.overview}</p>
          <ol className="space-y-4">
            {out.data.sections.map((s, i) => (
              <li key={i} className="rounded-lg border border-line bg-card p-4">
                <h4 className="font-mono text-sm font-bold text-ink">
                  {s.startLine === s.endLine ? `Line ${s.startLine}` : `Lines ${s.startLine}-${s.endLine}`}
                </h4>
                {input ? (
                  <div className="mt-2">
                    <CodeBlock code={input.split("\n").slice(s.startLine - 1, s.endLine).join("\n")} label="Code" startLine={s.startLine} copy={false} maxHeight="14rem" />
                  </div>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-ink">{s.explanation}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    case "generate":
    case "tests":
    case "convert": {
      const lang = languageLabel(out.type === "convert" ? (run.targetLanguage ?? run.language) : run.language);
      return (
        <div className="space-y-4">
          {mockLabel}
          <CodeBlock code={out.data.code} label={out.type === "tests" ? `Tests (${lang})` : `${lang} code`} />
          {out.data.explanation ? <p className="whitespace-pre-wrap text-ink">{out.data.explanation}</p> : null}
          <Notes title={out.type === "generate" ? "Assumptions" : out.type === "convert" ? "What doesn't map cleanly" : "Notes"} notes={out.data.notes} />
        </div>
      );
    }
    case "review": {
      const findings = [...out.data.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.startLine - b.startLine);
      return (
        <div className="space-y-4">
          {mockLabel}
          <p className="text-lg text-ink">{out.data.summary}</p>
          <p className="text-sm text-muted">
            {findings.length} finding{findings.length === 1 ? "" : "s"}
            {out.dropped ? `. ${out.dropped} more ${out.dropped === 1 ? "was" : "were"} removed because ${out.dropped === 1 ? "it" : "they"} pointed at lines that don't exist.` : "."}
            {out.repaired ? " The first reply was malformed; this is the repaired one." : ""}
          </p>
          {findings.length ? (
            <ul className="space-y-3">
              {findings.map((f, i) => (
                <Finding key={i} f={f} code={input} />
              ))}
            </ul>
          ) : null}
        </div>
      );
    }
    case "fix":
      return (
        <div className="space-y-4">
          {mockLabel}
          <div className="rounded-lg border border-line bg-card p-4">
            <h4 className="text-sm font-bold text-ink">Likely cause</h4>
            <p className="mt-1 text-ink">{out.data.cause}</p>
            <h4 className="mt-3 text-sm font-bold text-ink">What changed</h4>
            <p className="mt-1 whitespace-pre-wrap text-ink">{out.data.explanation}</p>
            <p className="mt-3 text-sm text-muted">
              Confidence: <strong className="text-ink">{out.data.confidence}</strong>
              {out.repaired ? ". The first reply was malformed; this is the repaired one." : ""}
            </p>
          </div>
          {input ? <DiffView before={input} after={out.data.correctedCode} /> : null}
          <CodeBlock code={out.data.correctedCode} label="Corrected code" />
        </div>
      );
  }
}
