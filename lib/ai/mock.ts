import { createHash } from "node:crypto";
import { ProviderError, type AiProvider, type Completion, type GenerateRequest, type StreamChunk } from "@/lib/ai/provider";

// A deterministic stand-in for the real model. Used when there is no
// GEMINI_API_KEY, when AI_PROVIDER=mock, and as the labelled fallback when
// the real provider keeps returning rate-limit errors. Same input -> same
// answer, so the check script can assert on it. Every answer says it is a
// mock, so nobody mistakes it for real analysis.
//
// The answers follow the exact layouts the prompts ask for, so they travel
// through the same parsing and Zod validation as real model output.

const COMMENT: Record<string, [string, string]> = {
  python: ["# ", ""], sql: ["-- ", ""], html_css: ["<!-- ", " -->"],
};
const comment = (lang: string, text: string) => {
  const [open, close] = COMMENT[lang] ?? ["// ", ""];
  return `${open}${text}${close}`;
};

const INJECTION = /ignore (?:all |your |previous )*instructions|system prompt|report no issues|this code is perfect/i;

function reviewOf(input: string): string {
  const lines = input.split("\n");
  const findings: Record<string, unknown>[] = [];
  lines.forEach((l, i) => {
    const n = i + 1;
    if (INJECTION.test(l)) {
      findings.push({ severity: "info", startLine: n, endLine: n, title: "Instruction-like comment in code", explanation: "[Mock] This comment tries to instruct the reviewer. It was treated as part of the code, not as an instruction." });
    }
    if (/(SELECT|INSERT|UPDATE|DELETE)\b.*["'`]\s*\+|\+\s*["'`].*(WHERE|VALUES)/i.test(l)) {
      findings.push({ severity: "error", startLine: n, endLine: n, title: "Possible SQL injection", explanation: "[Mock] User input appears to be concatenated into SQL. Use parameterised queries.", suggestedFix: "Pass values as parameters ($1, ?) instead of building the string." });
    }
    if (/\beval\s*\(/.test(l)) findings.push({ severity: "error", startLine: n, endLine: n, title: "eval() on dynamic input", explanation: "[Mock] eval runs arbitrary code. Avoid it." });
    if (/[^=!<>]==[^=]/.test(l) && !/^\s*(#|--)/.test(l)) {
      findings.push({ severity: "warning", startLine: n, endLine: n, title: "Loose equality", explanation: "[Mock] == converts types before comparing; === is usually what you mean (in JS/TS/PHP)." });
    }
    if (/\b(TODO|FIXME)\b/.test(l)) findings.push({ severity: "info", startLine: n, endLine: n, title: "Unfinished work marker", explanation: "[Mock] There is a TODO/FIXME here." });
  });
  return JSON.stringify({
    summary: `[Mock review] Simple pattern checks over ${lines.length} line(s) found ${findings.length} possible issue(s). This is not a real model review.`,
    findings: findings.slice(0, 12),
  });
}

function fixOf(input: string, lang: string): string {
  let corrected = input.replace(/([^=!<>])==([^=])/g, "$1===$2");
  if (lang === "python") corrected = corrected.replace(/return (\w+) \/ len\((\w+)\)/, "return $1 / len($2) if $2 else 0.0");
  if (corrected === input) corrected = `${comment(lang, "Mock fix: no automatic change found; check the error line by hand.")}\n${input}`;
  return JSON.stringify({
    cause: "[Mock] Pattern-based guess: no model looked at this error.",
    explanation: "[Mock] The mock applies a few mechanical fixes (such as == to ===). Compare the diff carefully.",
    correctedCode: corrected,
    confidence: "low",
  });
}

function streamTextOf(req: GenerateRequest): string {
  const task = req.task;
  const mode = task?.mode ?? "explain";
  const input = task?.input ?? "";
  const lang = task?.language ?? "javascript";
  if (mode === "explain") {
    const lines = input.split("\n");
    const groups: string[] = [];
    for (let start = 1; start <= lines.length; start += 4) {
      const end = Math.min(lines.length, start + 3);
      const sample = lines.slice(start - 1, end).find((l) => l.trim())?.trim().slice(0, 60) ?? "(blank lines)";
      groups.push(`LINES ${start}-${end}:\nThese lines start with \`${sample}\`. [Mock] A real model would explain what they do here.`);
    }
    return `OVERVIEW:\n[Mock explanation] This ${lines.length}-line snippet is shown in groups so you can see the layout of a real answer. No model read it.\n\n${groups.join("\n\n")}`;
  }
  const target = mode === "convert" ? (task?.targetLanguage ?? lang) : lang;
  const fence = target === "html_css" ? "html" : target;
  const code =
    mode === "generate"
      ? `${comment(target, `Mock code for: ${input.slice(0, 60).replace(/\s+/g, " ")}`)}\n${comment(target, "Replace with a real implementation.")}`
      : mode === "tests"
        ? `${comment(target, "Mock tests: a real model would write cases for each behaviour.")}\n${comment(target, `Input had ${input.split("\n").length} line(s).`)}`
        : `${comment(target, `Mock conversion to ${target}: the original is kept below as comments.`)}\n${input.split("\n").map((l) => comment(target, l)).join("\n")}`;
  const heading = mode === "generate" ? "ASSUMPTIONS" : "NOTES";
  return `CODE:\n\`\`\`${fence}\n${code}\n\`\`\`\nEXPLANATION:\n[Mock answer] This is placeholder output from the built-in mock provider, not a model.\n${heading}:\n- Mock output: read and replace it before use.`;
}

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export interface MockOptions {
  /** Milliseconds between streamed words (0 in the check script). */
  delayMs?: number;
}

/** Test hooks: make the next N structured calls return broken JSON, etc. */
export const mockFaults = { invalidJsonCalls: 0, rateLimitCalls: 0 };

export class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  private readonly delayMs: number;

  constructor(options: MockOptions = {}) {
    this.delayMs = options.delayMs ?? 12;
  }

  private answer(req: GenerateRequest): string {
    if (mockFaults.rateLimitCalls > 0) {
      mockFaults.rateLimitCalls--;
      throw new ProviderError("rate_limit", "rate_limited", "mock simulated 429");
    }
    if (req.jsonSchema) {
      if (mockFaults.invalidJsonCalls > 0) {
        mockFaults.invalidJsonCalls--;
        return 'Sure! Here is my review: {"summary": "Looks fine", "findings": [ {"severity": "critical"';
      }
      return req.task?.mode === "fix" ? fixOf(req.task.input, req.task.language) : reviewOf(req.task?.input ?? "");
    }
    return streamTextOf(req);
  }

  async complete(req: GenerateRequest): Promise<Completion> {
    const text = this.answer(req);
    const prompt = req.system + req.messages.map((m) => m.text).join("");
    return { text, usage: { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(text) } };
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamChunk> {
    const { text, usage } = await this.complete(req);
    // Split into word-ish pieces so the UI shows a real stream.
    for (const piece of text.match(/\S+\s*|\s+/g) ?? []) {
      if (req.signal?.aborted) throw new ProviderError("timeout", "aborted");
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      yield { type: "text", text: piece };
    }
    yield { type: "usage", usage };
  }
}

/** Short stable id for an input, handy in mock labels and tests. */
export const mockSeed = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
