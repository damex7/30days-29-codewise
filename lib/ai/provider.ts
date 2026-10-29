// The provider interface: the ONLY shape the rest of the app knows. No
// vendor SDK types leak past lib/ai/gemini.ts.
//
// Adding another provider (say, a local Ollama or another hosted API):
//  1. create lib/ai/<name>.ts with a class implementing AiProvider:
//     translate ChatMessage[] to the vendor format, yield StreamChunk text,
//     report Usage, and map vendor errors to ProviderError kinds;
//  2. add the name to AI_PROVIDER in lib/env.ts and to the runs.provider
//     CHECK (a new migration);
//  3. return it from getProvider() in lib/ai/select.ts;
//  4. add its prices to lib/ai/pricing.ts.
// Nothing in services, routes or UI changes.

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Ask for JSON matching this JSON Schema (structured-output mode). */
  jsonSchema?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
  /**
   * What the call is for. Real providers ignore it (they only see the
   * prompt); the mock uses it to build a deterministic, mode-shaped answer.
   */
  task?: { mode: string; language: string; targetLanguage?: string | undefined; input: string } | undefined;
}

export type StreamChunk = { type: "text"; text: string } | { type: "usage"; usage: Usage };

export interface Completion {
  text: string;
  usage: Usage;
}

export interface AiProvider {
  readonly name: "gemini" | "mock";
  /** Streams text pieces, then exactly one usage chunk at the end. */
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  /** One-shot call (used for structured JSON answers). */
  complete(request: GenerateRequest): Promise<Completion>;
}

export type ProviderErrorKind = "rate_limit" | "timeout" | "unavailable" | "refused" | "other";

/** Normalised provider failure; services map kind -> run status. */
export class ProviderError extends Error {
  override name = "ProviderError";
  readonly kind: ProviderErrorKind;
  /** Short machine code safe to store (never echoes user input). */
  readonly code: string;
  constructor(kind: ProviderErrorKind, code: string, message?: string, options?: ErrorOptions) {
    super(message ?? code, options);
    this.kind = kind;
    this.code = code;
  }
}

/** Collects a whole stream into a Completion (used by complete() defaults). */
export async function collect(chunks: AsyncIterable<StreamChunk>): Promise<Completion> {
  let text = "";
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  for await (const c of chunks) {
    if (c.type === "text") text += c.text;
    else usage = c.usage;
  }
  return { text, usage };
}
