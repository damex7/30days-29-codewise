"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { LANGUAGES, LEVELS, MODES, MODE_INFO, TEST_FRAMEWORKS, LIMITS, type Language, type Level, type Mode } from "@/lib/constants";
import { runRequestSchema } from "@/lib/validation/runs";
import { maskSecrets, type SecretFinding } from "@/lib/ai/secrets";
import type { RunView } from "@/lib/services/runs";
import { ErrorIcon, ErrorSummary, Field, inputClass } from "@/components/form";
import { RunResult } from "@/components/run-result";
import { StatusBadge, statusLabel } from "@/components/badges";
import { fieldErrorsClient } from "@/components/workbench/errors";
import { SaveSnippet, Feedback } from "@/components/run-actions";

// The workbench: mode tabs (ARIA tabs pattern), the input form, and the
// result panel. Submitting POSTs to /api/runs and reads the NDJSON stream.
//
// Idempotency: each submission gets a client-generated UUID. A retry of
// the SAME submission (network blip, double tap) reuses it, and the server
// returns the existing run instead of calling the model again. Editing any
// field, or finishing a run, starts a fresh id.

type Phase = "idle" | "running" | "done" | "error";
type ServerEvent =
  | { type: "started"; run: RunView }
  | { type: "text"; text: string }
  | { type: "reset"; notice: string }
  | { type: "done"; run: RunView }
  | { type: "error"; message: string };

const LABELS: Record<string, string> = {
  input: "Code",
  extra: "Error message",
  language: "Language",
  targetLanguage: "Convert to",
  framework: "Test framework",
  level: "Level",
};

const selectClass = `${inputClass} pr-8`;

export function Workbench({ providerLabel, providerIsMock }: { providerLabel: string; providerIsMock: boolean }) {
  const [mode, setMode] = useState<Mode>("explain");
  const [language, setLanguage] = useState<Language>("javascript");
  const [targetLanguage, setTargetLanguage] = useState<Language>("python");
  const [level, setLevel] = useState<Level>("beginner");
  const [framework, setFramework] = useState("");
  const [input, setInput] = useState("");
  const [extra, setExtra] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [streamText, setStreamText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [submittedInput, setSubmittedInput] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<SecretFinding[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string> | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [announce, setAnnounce] = useState("");

  const requestId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const resultRef = useRef<HTMLHeadingElement>(null);

  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    requestId.current = null; // changed input = a new submission
    set(v);
  };

  // ------------------------------------------------------------ tabs ---
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = MODES.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    const m = MODES[next] ?? "explain";
    edited(setMode)(m);
    tabRefs.current[m]?.focus();
  }

  // ---------------------------------------------------------- submit ---
  async function submit(overrides?: { input: string; extra: string }) {
    const payload = {
      mode,
      language,
      targetLanguage: mode === "convert" ? targetLanguage : undefined,
      level: mode === "explain" ? level : undefined,
      framework: mode === "tests" ? framework || TEST_FRAMEWORKS[language] : undefined,
      input: overrides?.input ?? input,
      extra: (overrides?.extra ?? extra) || undefined,
      clientRequestId: (requestId.current ??= crypto.randomUUID()),
    };
    // Same Zod schema as the server: instant feedback, but the server re-checks.
    const parsed = runRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrorsClient(parsed.error));
      setMessage(undefined);
      return;
    }
    setErrors(undefined);
    setMessage(undefined);
    setBlocked(null);
    setRun(null);
    setNotice(null);
    setStreamText("");
    setSubmittedInput(payload.input);
    setPhase("running");
    setAnnounce(MODE_INFO[mode].streams ? "Generating answer…" : "Working on it…");

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
        setErrors(body.fields);
        setMessage(body.error ?? "Something went wrong. Your input is still here; please try again.");
        setPhase("error");
        setAnnounce("");
        return;
      }
      if (res.headers.get("content-type")?.includes("application/json")) {
        const body = (await res.json()) as { type: "existing" | "blocked"; run: RunView; findings?: SecretFinding[] };
        if (body.type === "blocked") {
          setBlocked(body.findings ?? []);
          setPhase("error");
          requestId.current = null;
          setAnnounce("Not sent: possible secrets found in your input.");
          return;
        }
        finish(body.run, "This request was already submitted, so here is its answer (no second model call).");
        return;
      }
      await readStream(res);
    } catch (error) {
      if (controller.signal.aborted) {
        // Stop pressed: the server saves what it had as "interrupted".
        setPhase("done");
        setNotice("Stopped. The partial answer below has been saved to your history as “Stopped early”.");
        setAnnounce("Generation stopped.");
        requestId.current = null;
      } else {
        // Network trouble: keep the SAME request id so "Try again" can't double-run.
        setMessage("The connection dropped. Your input is still here. Press the button again to retry safely.");
        setPhase("error");
        setAnnounce("");
        void error;
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function readStream(res: Response) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const event = JSON.parse(line) as ServerEvent;
        if (event.type === "text") setStreamText((t) => t + event.text);
        else if (event.type === "reset") {
          setStreamText("");
          setNotice(event.notice);
        } else if (event.type === "done") finish(event.run);
        else if (event.type === "error") {
          setMessage(event.message);
          setPhase("error");
        }
      }
    }
  }

  function finish(result: RunView, info?: string) {
    setRun(result);
    if (info) setNotice(info);
    setPhase("done");
    requestId.current = null;
    // Announced once, politely, when complete; never token by token.
    setAnnounce(`Answer complete: ${statusLabel(result.status)}.`);
    requestAnimationFrame(() => resultRef.current?.focus());
  }

  function maskAndContinue() {
    const maskedInput = maskSecrets(input);
    const maskedExtra = maskSecrets(extra);
    setInput(maskedInput);
    setExtra(maskedExtra);
    requestId.current = null;
    void submit({ input: maskedInput, extra: maskedExtra });
  }

  const running = phase === "running";
  const isGenerate = mode === "generate";
  const showResult = phase !== "idle" && (running || run || blocked || streamText || notice);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section aria-labelledby="input-heading" className="min-w-0">
        <h2 id="input-heading" className="sr-only">
          Your input
        </h2>
        <div role="tablist" aria-label="Mode" className="flex flex-wrap gap-1 border-b border-line pb-2">
          {MODES.map((m, i) => (
            <button
              key={m}
              ref={(el) => {
                tabRefs.current[m] = el;
              }}
              role="tab"
              id={`tab-${m}`}
              type="button"
              aria-selected={mode === m}
              aria-controls="mode-panel"
              tabIndex={mode === m ? 0 : -1}
              onClick={() => edited(setMode)(m)}
              onKeyDown={(e) => onTabKey(e, i)}
              className="min-h-10 rounded-md px-3 text-sm font-semibold text-ink hover:bg-card aria-selected:bg-brand-btn aria-selected:text-on-brand"
            >
              {MODE_INFO[m].label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="mode-panel" aria-labelledby={`tab-${mode}`} className="pt-4">
          <p className="mb-4 text-muted">{MODE_INFO[mode].blurb}</p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!running) void submit();
            }}
          >
            <ErrorSummary errors={errors} message={message} labels={LABELS} />

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field id="language" label={isGenerate ? "Language to write in" : mode === "convert" ? "Convert from" : "Language"} error={errors?.language}>
                {(a) => (
                  <select {...a} value={language} onChange={(e) => edited(setLanguage)(e.target.value as Language)} className={selectClass}>
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {mode === "convert" ? (
                <Field id="targetLanguage" label="Convert to" error={errors?.targetLanguage}>
                  {(a) => (
                    <select {...a} value={targetLanguage} onChange={(e) => edited(setTargetLanguage)(e.target.value as Language)} className={selectClass}>
                      {LANGUAGES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}
              {mode === "explain" ? (
                <Field id="level" label="Explain for" error={errors?.level}>
                  {(a) => (
                    <select {...a} value={level} onChange={(e) => edited(setLevel)(e.target.value as Level)} className={selectClass}>
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l[0]?.toUpperCase() + l.slice(1)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}
              {mode === "tests" ? (
                <Field id="framework" label="Test framework" error={errors?.framework}>
                  {(a) => (
                    <input {...a} value={framework} placeholder={TEST_FRAMEWORKS[language]} onChange={(e) => edited(setFramework)(e.target.value)} className={inputClass} />
                  )}
                </Field>
              ) : null}
            </div>

            <PrivacyNote />

            <Field
              id="input"
              label={isGenerate ? "Describe what you want" : "Code"}
              error={errors?.input}
              hint={`${input.length.toLocaleString("en-US")} / ${LIMITS.MAX_INPUT_CHARS.toLocaleString("en-US")} characters`}
            >
              {(a) => (
                <textarea
                  {...a}
                  value={input}
                  onChange={(e) => edited(setInput)(e.target.value)}
                  rows={isGenerate ? 5 : 14}
                  spellCheck={isGenerate}
                  autoCapitalize="off"
                  placeholder={isGenerate ? "e.g. A function that checks whether a Nigerian phone number is valid, with tests in mind" : "Paste your code here"}
                  className={`${inputClass} ${isGenerate ? "" : "font-mono text-[13px] leading-6"}`}
                  style={{ tabSize: 2 }}
                />
              )}
            </Field>

            {mode === "fix" ? (
              <Field id="extra" label="Error message or stack trace (optional)" error={errors?.extra}>
                {(a) => (
                  <textarea {...a} value={extra} onChange={(e) => edited(setExtra)(e.target.value)} rows={4} className={`${inputClass} font-mono text-[13px]`} />
                )}
              </Field>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={running}
                className="inline-flex min-h-11 items-center rounded-md bg-brand-btn px-5 font-semibold text-on-brand hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
              >
                {running ? "Working…" : `${MODE_INFO[mode].label}`}
              </button>
              {running ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="min-h-11 rounded-md border-2 border-strong px-4 font-semibold text-ink">
                  Stop generating
                </button>
              ) : null}
              <span className="text-xs text-muted">
                Answering: {providerLabel}
                {providerIsMock ? " (placeholder answers)" : ""}
              </span>
            </div>
          </form>
        </div>
      </section>

      <section aria-labelledby="result-heading" className="min-w-0">
        <div aria-live="polite" role="status" className="sr-only">
          {announce}
        </div>
        <h2 id="result-heading" ref={resultRef} tabIndex={-1} className="text-xl font-bold text-ink">
          Answer
        </h2>
        {!showResult ? (
          <EmptyResult />
        ) : (
          <div className="mt-3 space-y-4" aria-busy={running}>
            {notice ? <p className="rounded-md border border-line bg-card p-3 text-sm text-ink">{notice}</p> : null}
            {blocked ? <SecretsBlocked findings={blocked} onMask={maskAndContinue} /> : null}
            {run ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge status={run.status} />
                  <span>
                    {run.provider === "mock" ? "Mock provider" : run.model} · {run.inputTokens + run.outputTokens} tokens
                    {run.latencyMs !== null ? ` · ${(run.latencyMs / 1000).toFixed(1)}s` : ""}
                  </span>
                </div>
                <RunResult run={run} input={submittedInput} />
                <ResultExtras run={run} />
              </>
            ) : streamText || running ? (
              <StreamPanel text={streamText} running={running} structured={!MODE_INFO[mode].streams} />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

/** Save and rate: shown under every finished answer that has an output. */
function ResultExtras({ run }: { run: RunView }) {
  if (!run.output || run.output.type === "blocked") return null;
  const title = `${MODE_INFO[run.mode].label}: ${new Date(run.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      <SaveSnippet runId={run.id} defaultTitle={title} />
      <Feedback runId={run.id} />
    </div>
  );
}

function PrivacyNote() {
  return (
    <div className="mb-4 flex gap-3 rounded-md border border-line bg-card p-3 text-sm text-ink">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="mt-0.5 shrink-0">
        <path d="M9 1 2 4v5c0 4 3 7 7 8 4-1 7-4 7-8V4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="9" cy="12.6" r="1" fill="currentColor" />
      </svg>
      <p>
        <strong>Don&apos;t paste private or proprietary code.</strong> Free AI tiers may use what you send to improve their models. Secrets (API keys, passwords) are
        blocked before sending, but the scanner can miss things. Codewise never runs your code.
      </p>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-line p-6 text-muted">
      <p>Your answer will appear here.</p>
      <p className="mt-2 text-sm">Tip: paste just the part you need help with. Shorter inputs give clearer answers and use less of the free quota.</p>
    </div>
  );
}

function StreamPanel({ text, running, structured }: { text: string; running: boolean; structured: boolean }) {
  if (!text && running) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <div className="h-5 w-3/4 skeleton" />
        <div className="h-5 w-5/6 skeleton" />
        <div className="h-5 w-2/3 skeleton" />
        <p className="pt-2 text-sm text-muted">{structured ? "Checking the code and validating the structured answer…" : "Waiting for the first words…"}</p>
      </div>
    );
  }
  return (
    <div className="code-panel rounded-lg border border-code-line bg-code p-4 text-code-fg">
      <p className="mb-2 text-xs text-code-muted">{running ? "Streaming… the answer is checked and formatted when it finishes." : "Partial answer"}</p>
      <div tabIndex={0} role="region" aria-label="Streaming answer (scrollable)" className="max-h-[32rem] overflow-auto">
        <p className={`font-mono text-[13px] leading-6 whitespace-pre-wrap ${running ? "stream-caret" : ""}`}>{text}</p>
      </div>
    </div>
  );
}

function SecretsBlocked({ findings, onMask }: { findings: SecretFinding[]; onMask: () => void }) {
  return (
    <div role="alert" className="rounded-md border-4 border-double border-strong p-4 text-ink">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <ErrorIcon /> Not sent: this looks like it contains secrets
      </h3>
      <p className="mt-2">Nothing was sent to the AI and the values weren&apos;t saved. We found:</p>
      <ul className="mt-2 list-disc pl-6">
        {findings.map((f, i) => (
          <li key={i}>
            {f.where === "details" ? "Error box" : "Code"} line {f.line}: {f.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        “Mask and continue” replaces each value with a placeholder like &lt;REDACTED_API_KEY&gt; in your input and sends it. If it&apos;s a false alarm (a fake test key),
        masking is still safe: the code&apos;s shape stays the same.
      </p>
      <button type="button" onClick={onMask} className="mt-3 min-h-11 rounded-md bg-brand-btn px-5 font-semibold text-on-brand">
        Mask and continue
      </button>
    </div>
  );
}
