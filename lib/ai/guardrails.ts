import { z } from "zod";
import { LIMITS, type Mode } from "@/lib/constants";
import {
  codeOutputSchema,
  explainOutputSchema,
  fixOutputSchema,
  reviewOutputSchema,
  type CodeOutput,
  type ExplainOutput,
  type FixOutput,
  type ReviewOutput,
} from "@/lib/ai/schemas";

// Everything that checks model output before anyone sees it. All of this
// is REAL defence (code), unlike the prompt wording.

export type Checked<T> = { ok: true; data: T; dropped?: number } | { ok: false; problems: string[] };

/** Never let a runaway answer through: hard cap on characters. */
export function capOutput(text: string): string {
  return text.length > LIMITS.MAX_OUTPUT_CHARS ? `${text.slice(0, LIMITS.MAX_OUTPUT_CHARS)}\n\n[Answer cut off at ${LIMITS.MAX_OUTPUT_CHARS} characters]` : text;
}

/** The prompt asks the model to start a refusal with "REFUSED:". */
export function isRefusal(text: string): boolean {
  return /^\s*REFUSED:/i.test(text);
}

const issueList = (error: z.ZodError) =>
  error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);

/** Models sometimes wrap JSON in ```json fences despite instructions. */
function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, problem: "the reply was not valid JSON" };
  }
}

/**
 * Review: schema + every finding's lines must be inside the real input.
 * A model can confidently cite "line 48" of a 20-line file; we refuse it.
 * strict=true (first attempt): any out-of-range finding fails validation,
 * which triggers the one repair retry. strict=false (after the repair):
 * out-of-range findings are dropped and counted, the rest is kept.
 */
export function checkReview(raw: string, lineCount: number, strict: boolean): Checked<ReviewOutput> {
  const json = parseJson(raw);
  if (!json.ok) return { ok: false, problems: [json.problem] };
  const parsed = reviewOutputSchema.safeParse(json.value);
  if (!parsed.success) return { ok: false, problems: issueList(parsed.error) };
  const inRange = (f: ReviewOutput["findings"][number]) => f.startLine >= 1 && f.endLine <= lineCount;
  const bad = parsed.data.findings.filter((f) => !inRange(f));
  if (bad.length && strict) {
    return { ok: false, problems: bad.map((f) => `finding "${f.title.slice(0, 40)}" cites lines ${f.startLine}-${f.endLine} but the code has ${lineCount} lines`) };
  }
  return { ok: true, data: { ...parsed.data, findings: parsed.data.findings.filter(inRange) }, dropped: bad.length };
}

/** Strip "N| " prefixes if the model copied our line numbers into its code. */
export function stripLineNumbers(code: string): string {
  const lines = code.split("\n");
  const numbered = lines.filter((l) => l.trim()).every((l) => /^\s*\d+\| ?/.test(l));
  return numbered ? lines.map((l) => l.replace(/^\s*\d+\| ?/, "")).join("\n") : code;
}

export function checkFix(raw: string): Checked<FixOutput> {
  const json = parseJson(raw);
  if (!json.ok) return { ok: false, problems: [json.problem] };
  const parsed = fixOutputSchema.safeParse(json.value);
  if (!parsed.success) return { ok: false, problems: issueList(parsed.error) };
  return { ok: true, data: { ...parsed.data, correctedCode: stripLineNumbers(parsed.data.correctedCode) } };
}

// ------------------------------------------------- streamed text layouts

/** OVERVIEW: ... then "LINES a-b:" blocks (see prompts.ts). */
export function parseExplain(text: string, lineCount: number): Checked<ExplainOutput> {
  const overview = /OVERVIEW:\s*([\s\S]*?)(?=\n\s*LINES\s+\d|$)/i.exec(text)?.[1]?.trim() ?? "";
  const sections: ExplainOutput["sections"] = [];
  const re = /^\s*\**LINES?\s+(\d+)(?:\s*[-–]\s*(\d+))?\s*:?\**\s*$([\s\S]*?)(?=^\s*\**LINES?\s+\d|(?![\s\S]))/gim;
  for (const m of text.matchAll(re)) {
    const start = Number(m[1]);
    const end = Number(m[2] ?? m[1]);
    const explanation = (m[3] ?? "").trim();
    // Same rule as reviews: sections must point at lines that exist.
    if (start >= 1 && end >= start && end <= lineCount && explanation) sections.push({ startLine: start, endLine: end, explanation });
  }
  const parsed = explainOutputSchema.safeParse({ overview, sections });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, problems: issueList(parsed.error) };
}

/** CODE: ```lang ... ``` / EXPLANATION: / NOTES: (or ASSUMPTIONS:). */
export function parseCodeAnswer(text: string): Checked<CodeOutput> {
  const code = /```[\w+#-]*\s*\n([\s\S]*?)\n?```/.exec(text)?.[1] ?? "";
  const afterCode = text.slice(text.lastIndexOf("```") + 3);
  const explanation = /EXPLANATION:\s*([\s\S]*?)(?=\n\s*(?:NOTES|ASSUMPTIONS):|$)/i.exec(afterCode)?.[1]?.trim() ?? "";
  const notesBlock = /(?:NOTES|ASSUMPTIONS):\s*([\s\S]*)$/i.exec(afterCode)?.[1] ?? "";
  const notes = notesBlock
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l && !/^none\.?$/i.test(l))
    .slice(0, 12)
    .map((l) => l.slice(0, 400));
  const parsed = codeOutputSchema.safeParse({ code, explanation: explanation.slice(0, 3_000), notes });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, problems: issueList(parsed.error) };
}

export function parseStreamed(mode: Mode, text: string, lineCount: number): Checked<ExplainOutput | CodeOutput> {
  return mode === "explain" ? parseExplain(text, lineCount) : parseCodeAnswer(text);
}
