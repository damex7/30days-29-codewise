import { z } from "zod";

// Zod schemas for EVERY piece of model output. Model output is untrusted:
// it can be malformed JSON, the wrong shape, absurdly long, or point at
// lines that don't exist. Nothing reaches the database or the screen as
// "structured" until it passes these schemas (and the line-range check).
//
// Why structured output beats parsing prose: with a schema the app can
// rely on findings[i].startLine being an integer, sort by severity, jump to
// the line and refuse nonsense, instead of guessing with regexes over
// "On line 4-ish there might be...".
//
// The JSON Schemas sent to Gemini (responseJsonSchema) are generated from
// these same Zod schemas with z.toJSONSchema(), so the two can't drift.
// Length limits (max) are enforced here; Gemini ignores maxLength.

const text = (max: number) => z.string().trim().min(1).max(max);
const line = z.number().int().min(1).max(10_000);

export const SEVERITIES = ["info", "warning", "error"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const reviewFindingSchema = z
  .object({
    severity: z.enum(SEVERITIES),
    startLine: line,
    endLine: line,
    title: text(120),
    explanation: text(1_200),
    suggestedFix: z.string().trim().max(2_000).optional(),
  })
  .refine((f) => f.endLine >= f.startLine, { message: "endLine is before startLine", path: ["endLine"] });

export const reviewOutputSchema = z.object({
  summary: text(1_500),
  findings: z.array(reviewFindingSchema).max(20),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const fixOutputSchema = z.object({
  cause: text(800),
  explanation: text(2_000),
  correctedCode: z.string().min(1).max(20_000),
  confidence: z.enum(["low", "medium", "high"]),
});
export type FixOutput = z.infer<typeof fixOutputSchema>;

// The streamed modes produce text in a fixed, simple layout (see prompts.ts)
// that lib/ai/parse.ts turns into these shapes once the stream ends.
export const explainOutputSchema = z.object({
  overview: text(2_000),
  sections: z
    .array(z.object({ startLine: line, endLine: line, explanation: text(2_000) }))
    .min(1)
    .max(40),
});
export type ExplainOutput = z.infer<typeof explainOutputSchema>;

export const codeOutputSchema = z.object({
  code: z.string().min(1).max(20_000),
  explanation: z.string().trim().max(3_000),
  notes: z.array(text(400)).max(12),
});
export type CodeOutput = z.infer<typeof codeOutputSchema>;

export const secretFindingSchema = z.object({ line: line, kind: z.string().max(40), label: z.string().max(80) });

/**
 * What a run stores in runs.output. Structured results carry their mode as
 * a discriminator; everything else is {"type":"text"} with a reason, so
 * the UI can label an unstructured fallback honestly.
 */
export const storedOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("explain"), data: explainOutputSchema }),
  z.object({ type: z.literal("generate"), data: codeOutputSchema }),
  z.object({ type: z.literal("review"), data: reviewOutputSchema }),
  z.object({ type: z.literal("fix"), data: fixOutputSchema }),
  z.object({ type: z.literal("tests"), data: codeOutputSchema }),
  z.object({ type: z.literal("convert"), data: codeOutputSchema }),
  z.object({ type: z.literal("blocked"), findings: z.array(secretFindingSchema) }),
  z.object({
    type: z.literal("text"),
    text: z.string().max(40_000),
    reason: z.enum(["unstructured", "refused", "interrupted", "stream"]),
  }),
]);
export type StoredOutput = z.infer<typeof storedOutputSchema>;

/** JSON Schemas for the provider's structured-output mode. */
export const reviewJsonSchema = z.toJSONSchema(reviewOutputSchema, { target: "draft-2020-12", io: "input" });
export const fixJsonSchema = z.toJSONSchema(fixOutputSchema, { target: "draft-2020-12", io: "input" });
