import "server-only";
import type { Actor } from "@/lib/auth/current-user";
import { LIMITS, MODE_INFO, type Mode } from "@/lib/constants";
import { sha256 } from "@/lib/crypto";
import { log } from "@/lib/log";
import { hitLimit, MINUTE, DAY } from "@/lib/rate-limit";
import { insertRun, findRunByRequestId, findRunForUser, finishRun, listRunsForUser, type RunRow, type RunResult } from "@/lib/repos/runs";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { buildPrompt, repairMessages, PROMPT_VERSION, type BuiltPrompt } from "@/lib/ai/prompts";
import { scanForSecrets, type SecretFinding } from "@/lib/ai/secrets";
import { reviewJsonSchema, fixJsonSchema, type StoredOutput } from "@/lib/ai/schemas";
import { capOutput, checkFix, checkReview, isRefusal, parseStreamed, type Checked } from "@/lib/ai/guardrails";
import { estimateCostMicroUsd } from "@/lib/ai/pricing";
import { getProvider, mockProvider } from "@/lib/ai/select";
import { recordProviderFailure, recordProviderSuccess } from "@/lib/ai/breaker";
import { ProviderError, type AiProvider, type GenerateRequest, type Usage } from "@/lib/ai/provider";
import { LimitError, NotFoundError } from "@/lib/services/errors";
import type { RunRequest } from "@/lib/validation/runs";

// The run service: every rule about calling the model lives here.
// Acting user first: the caller passes who is asking, and every query
// below is scoped to that user.
//
// Order of a run (see the README diagram):
//   1. idempotency: same clientRequestId already seen -> return that run
//   2. per-minute rate limit
//   3. SECRETS SCAN -> blocked_secret run, provider NOT called
//   4. daily cap
//   5. INSERT the run as 'pending' BEFORE calling the model. If the server
//      dies mid-call there is still a record; the unique key is claimed
//      before any quota is spent, so a racing duplicate can't also call.
//   6. call the provider (timeout, retry once on 429, then mock fallback)
//   7. validate the output (Zod + line checks), repair once, else raw text
//   8. finish the run: output, tokens, latency, estimated cost

export interface RunView {
  id: string;
  mode: Mode;
  language: string;
  targetLanguage: string | null;
  level: string | null;
  framework: string | null;
  status: string;
  provider: string;
  model: string;
  inputText: string | null;
  inputExtra: string | null;
  output: StoredOutput | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  costMicroUsd: number;
  errorCode: string | null;
  createdAt: string;
}

export function toRunView(r: RunRow): RunView {
  return {
    id: r.id,
    mode: r.mode as Mode,
    language: r.language,
    targetLanguage: r.target_language,
    level: r.level,
    framework: r.framework,
    status: r.status,
    provider: r.provider,
    model: r.model,
    inputText: r.input_text,
    inputExtra: r.input_extra,
    output: r.output,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    latencyMs: r.latency_ms,
    costMicroUsd: Number(r.estimated_cost_micro_usd),
    errorCode: r.error_code,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export type StartResult =
  | { type: "existing"; run: RunView }
  | { type: "blocked"; run: RunView; findings: SecretFinding[] }
  | { type: "started"; run: RunView; request: RunRequest };

function scanBoth(req: RunRequest): SecretFinding[] {
  return [
    ...scanForSecrets(req.input).map((f) => ({ ...f, where: "code" as const })),
    ...(req.extra ? scanForSecrets(req.extra).map((f) => ({ ...f, where: "details" as const })) : []),
  ];
}

export async function startRun(actor: Actor, req: RunRequest): Promise<StartResult> {
  // 1. Idempotency (cheap read first; the unique constraint is the real guard).
  const seen = await findRunByRequestId(actor.id, req.clientRequestId);
  if (seen) return { type: "existing", run: toRunView(seen) };

  // 2. Per-minute limit protects the provider's per-minute quota.
  const minute = await hitLimit(`run:min:${actor.id}`, LIMITS.PER_MINUTE, MINUTE);
  if (!minute.ok) throw new LimitError("per_minute", minute.retryAfter, `You've hit the limit of ${LIMITS.PER_MINUTE} requests a minute. Try again in ${minute.retryAfter}s.`);

  const base = {
    userId: actor.id,
    clientRequestId: req.clientRequestId,
    mode: req.mode,
    language: req.language,
    targetLanguage: req.targetLanguage ?? null,
    level: req.level ?? null,
    framework: req.framework ?? null,
    inputHash: sha256(req.input + "\u0000" + (req.extra ?? "")),
    inputChars: req.input.length + (req.extra?.length ?? 0),
    promptVersion: PROMPT_VERSION,
  };

  // 3. Secrets gate. Nothing is sent and nothing pasted is stored; only
  //    the line numbers and kinds of what was found.
  const findings = scanBoth(req);
  if (findings.length) {
    const row =
      (await insertRun({ ...base, inputText: null, inputExtra: null, provider: "none", model: "none", status: "blocked_secret", output: { type: "blocked", findings } })) ??
      (await findRunByRequestId(actor.id, req.clientRequestId));
    if (!row) throw new Error("run insert failed");
    log("run.blocked_secret", { runId: row.id, mode: req.mode, findings: findings.length });
    return { type: "blocked", run: toRunView(row), findings };
  }

  // 4. Daily cap: only runs that will actually call the model count.
  const cap = actor.isDemo ? LIMITS.DEMO_DAILY_RUNS : LIMITS.DAILY_RUNS;
  const day = await hitLimit(`run:day:${actor.id}`, cap, DAY);
  if (!day.ok) throw new LimitError("daily", day.retryAfter, `You've used all ${cap} runs for today. The allowance resets at midnight UTC.`);

  // 5. Record BEFORE calling the model.
  const { provider, model } = getProvider();
  const row = await insertRun({ ...base, inputText: req.input, inputExtra: req.extra ?? null, provider: provider.name, model, status: "pending", output: null });
  if (!row) {
    const existing = await findRunByRequestId(actor.id, req.clientRequestId);
    if (!existing) throw new Error("run insert failed");
    return { type: "existing", run: toRunView(existing) };
  }
  return { type: "started", run: toRunView(row), request: req };
}

// ------------------------------------------------------------ execution

export interface ExecuteHooks {
  /** Streamed text pieces (stream modes only). */
  onText?: (text: string) => void;
  /** The provider switched (e.g. to the mock): discard text shown so far. */
  onReset?: (notice: string) => void;
  /** Aborted when the browser disconnects or presses Stop. */
  signal?: AbortSignal;
  /** Test hook: shorter backoff. */
  backoffMs?: number;
}

const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });
const ZERO: Usage = { inputTokens: 0, outputTokens: 0 };

class OutputTooLong extends Error {}

/** One provider call with the timeout + client-abort signal; streams if asked. */
async function callOnce(provider: AiProvider, request: GenerateRequest, onText?: (t: string) => void): Promise<{ text: string; usage: Usage }> {
  if (!onText) return provider.complete(request);
  let text = "";
  let usage = ZERO;
  for await (const chunk of provider.stream(request)) {
    if (chunk.type === "usage") usage = chunk.usage;
    else {
      text += chunk.text;
      onText(chunk.text);
      if (text.length > LIMITS.MAX_OUTPUT_CHARS) throw new OutputTooLong();
    }
  }
  return { text, usage };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("timeout", "aborted"));
    }, { once: true });
  });

export async function executeRun(actor: Actor, started: Extract<StartResult, { type: "started" }>, hooks: ExecuteHooks = {}): Promise<RunView> {
  const { run, request: req } = started;
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(LIMITS.REQUEST_TIMEOUT_MS);
  const signal = hooks.signal ? AbortSignal.any([hooks.signal, timeout]) : timeout;
  const streams = MODE_INFO[req.mode].streams;
  const prompt: BuiltPrompt = buildPrompt(req);
  const lineCount = req.input.split("\n").length;

  const picked = getProvider();
  let { provider, model } = picked;
  let usage = ZERO;
  let fellBack = picked.fallback;
  let partial = "";
  const onText = streams
    ? (t: string) => {
        partial += t;
        hooks.onText?.(t);
      }
    : undefined;

  const requestFor = (messages = prompt.messages): GenerateRequest => ({
    model,
    system: prompt.system,
    messages,
    maxOutputTokens: LIMITS.MAX_OUTPUT_TOKENS,
    jsonSchema: req.mode === "review" ? reviewJsonSchema : req.mode === "fix" ? fixJsonSchema : undefined,
    signal,
    task: { mode: req.mode, language: req.language, targetLanguage: req.targetLanguage, input: req.input },
  });

  const switchToMock = (why: string) => {
    fellBack = true;
    provider = mockProvider();
    model = "mock-v1";
    if (partial) {
      partial = "";
      hooks.onReset?.(why);
    }
  };

  /**
   * Free-tier reality: a 429 is common. Retry ONCE after a short backoff;
   * if it's still rate-limited (or unreachable), answer from the mock with
   * a clear label instead of failing the user, and trip the breaker so the
   * next requests go straight to the mock for a minute.
   */
  async function call(messages = prompt.messages) {
    try {
      return await callOnce(provider, requestFor(messages), onText);
    } catch (error) {
      if (!(error instanceof ProviderError) || provider.name === "mock" || signal.aborted) throw error;
      if (error.kind === "rate_limit") {
        await sleep((hooks.backoffMs ?? 1_500) + Math.floor(Math.random() * 500), signal);
        if (partial) {
          partial = "";
          hooks.onReset?.("Retrying…");
        }
        try {
          const result = await callOnce(provider, requestFor(messages), onText);
          recordProviderSuccess();
          return result;
        } catch (retryError) {
          if (!(retryError instanceof ProviderError) || !["rate_limit", "unavailable"].includes(retryError.kind) || signal.aborted) throw retryError;
        }
      } else if (error.kind !== "unavailable") {
        throw error;
      }
      recordProviderFailure();
      switchToMock("The AI provider is busy or unreachable right now, so this answer comes from the built-in mock.");
      return callOnce(provider, requestFor(messages), onText);
    }
  }

  let result: Omit<RunResult, "latencyMs" | "costMicroUsd" | "provider" | "model" | "inputTokens" | "outputTokens">;
  try {
    const first = await call();
    usage = addUsage(usage, first.usage);
    if (provider.name === "gemini") recordProviderSuccess();
    const text = capOutput(first.text);

    if (isRefusal(text)) {
      result = { status: "refused", output: { type: "text", reason: "refused", text: text.replace(/^\s*REFUSED:\s*/i, "") }, errorCode: null };
    } else if (streams) {
      // Streamed modes: parse the fixed layout. If the model ignored it, the
      // user already saw the text; keep it, clearly labelled as unstructured.
      const parsed = parseStreamed(req.mode, text, lineCount);
      result = parsed.ok
        ? { status: fellBack ? "fallback_mock" : "ok", output: { type: req.mode, data: parsed.data } as StoredOutput, errorCode: null }
        : { status: "invalid_output", output: { type: "text", reason: "unstructured", text }, errorCode: "unparseable_layout" };
    } else {
      // Structured modes: validate; on failure ask ONCE for a repaired reply.
      async function validated<T>(check: (raw: string, strict: boolean) => Checked<T>, wrap: (data: T, dropped: number, repaired: boolean) => StoredOutput) {
        let checked = check(text, true);
        let raw = text;
        if (!checked.ok) {
          log("run.repair", { runId: run.id, mode: req.mode, problems: checked.problems.length });
          const second = await call(repairMessages(prompt, text, checked.problems));
          usage = addUsage(usage, second.usage);
          raw = capOutput(second.text);
          checked = check(raw, false);
          if (checked.ok) return { ok: true as const, output: wrap(checked.data, checked.dropped ?? 0, true) };
          return { ok: false as const, raw };
        }
        return { ok: true as const, output: wrap(checked.data, checked.dropped ?? 0, false) };
      }
      const outcome =
        req.mode === "review"
          ? await validated(
              (raw, strict) => checkReview(raw, lineCount, strict),
              (data, dropped, repaired): StoredOutput => ({ type: "review", data, ...(dropped ? { dropped } : {}), ...(repaired ? { repaired } : {}) }),
            )
          : await validated(checkFix, (data, _dropped, repaired): StoredOutput => ({ type: "fix", data, ...(repaired ? { repaired } : {}) }));
      result = outcome.ok
        ? { status: fellBack ? "fallback_mock" : "ok", output: outcome.output, errorCode: null }
        : { status: "invalid_output", output: { type: "text", reason: "unstructured", text: outcome.raw || "(empty reply)" }, errorCode: "schema_invalid" };
    }
  } catch (error) {
    const clientGone = hooks.signal?.aborted === true;
    if (clientGone) {
      // Stop pressed / tab closed: keep what streamed so far.
      result = { status: "interrupted", output: partial ? { type: "text", reason: "interrupted", text: capOutput(partial) } : null, errorCode: "client_abort" };
    } else if (error instanceof OutputTooLong) {
      result = { status: "invalid_output", output: { type: "text", reason: "unstructured", text: capOutput(partial) }, errorCode: "output_too_long" };
    } else if (error instanceof ProviderError) {
      const status = error.kind === "timeout" ? "timeout" : error.kind === "rate_limit" ? "rate_limited" : error.kind === "refused" ? "refused" : "error";
      result = { status, output: error.kind === "refused" ? { type: "text", reason: "refused", text: "The provider declined to answer this request." } : null, errorCode: error.code };
    } else {
      result = { status: "error", output: null, errorCode: "internal" };
      log("run.internal_error", { runId: run.id, error: error instanceof Error ? error.name : "unknown" });
    }
  }

  const latencyMs = Date.now() - t0;
  const finished = await finishRun(actor.id, run.id, {
    ...result,
    provider: provider.name,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    latencyMs,
    costMicroUsd: estimateCostMicroUsd(provider.name, model, usage.inputTokens, usage.outputTokens),
  });
  // Logged: ids, mode, status, numbers. Never the code, the output or an email.
  log("run.finished", {
    runId: run.id, mode: req.mode, status: result.status, provider: provider.name, model,
    latencyMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, errorCode: result.errorCode,
  });
  const row = finished ?? (await findRunForUser(actor.id, run.id));
  if (!row) throw new NotFoundError();
  return toRunView(row);
}

/** Someone else's run (or no run) -> NotFoundError, never "forbidden". */
export async function getRun(actor: Actor, runId: string): Promise<RunView> {
  const row = await findRunForUser(actor.id, runId);
  if (!row) throw new NotFoundError();
  return toRunView(row);
}

/** /history: my runs, newest first, keyset-paged (see listRunsForUser). */
export async function listRuns(actor: Actor, f: { mode?: string | undefined; status?: string | undefined; after?: string | undefined }) {
  const limit = 15;
  const before = decodeCursor(f.after);
  const rows = await listRunsForUser(actor.id, {
    mode: f.mode,
    status: f.status,
    before: before ? { createdAt: before.at, id: before.id } : undefined,
    limit: limit + 1, // one extra row tells us whether there is a next page
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { runs: page.map(toRunView), next: rows.length > limit && last ? encodeCursor(last.cursor_at, last.id) : null };
}
