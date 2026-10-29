import "server-only";
import { ApiError, GoogleGenAI, type Content, type GenerateContentParameters } from "@google/genai";
import { ProviderError, collect, type AiProvider, type Completion, type GenerateRequest, type StreamChunk } from "@/lib/ai/provider";

// The ONLY file that imports the Gemini SDK. It translates our normalised
// messages into Gemini "contents", streams text back as StreamChunks, and
// maps SDK errors to ProviderError kinds.
//
// We use models.generateContent / generateContentStream (still fully
// supported) rather than the newer Interactions API, because Interactions
// stores conversations on Google's side by default, and pasted code should
// not be kept anywhere it doesn't need to be. Each call here is stateless.
//
// Structured output: responseMimeType "application/json" plus
// responseJsonSchema (a JSON Schema made from our Zod schema). Gemini
// constrains decoding to that shape, but we STILL validate with Zod: the
// docs say some keywords (maxLength...) aren't enforced, and output can be
// cut off at maxOutputTokens.

function toContents(messages: GenerateRequest["messages"]): Content[] {
  return messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
}

function withoutMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...schema };
  delete rest.$schema;
  return rest;
}

function normalise(error: unknown, signal: AbortSignal | undefined): ProviderError {
  if (error instanceof ProviderError) return error;
  if (signal?.aborted) return new ProviderError("timeout", "timeout", "request aborted", { cause: error });
  if (error instanceof ApiError) {
    if (error.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(error.message)) return new ProviderError("rate_limit", "rate_limited", undefined, { cause: error });
    if (error.status === 408 || error.status === 504) return new ProviderError("timeout", "timeout", undefined, { cause: error });
    if (error.status === 503) return new ProviderError("unavailable", "http_503", undefined, { cause: error });
    return new ProviderError("other", `http_${error.status}`, undefined, { cause: error });
  }
  if (error instanceof Error && /429|RESOURCE_EXHAUSTED/.test(error.message)) return new ProviderError("rate_limit", "rate_limited", undefined, { cause: error });
  const code = (error as { cause?: { code?: unknown } })?.cause?.code;
  if (error instanceof TypeError || (typeof code === "string" && /^(ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|UND_ERR)/.test(code))) {
    return new ProviderError("unavailable", "network", undefined, { cause: error });
  }
  return new ProviderError("other", "provider_error", undefined, { cause: error });
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey }); // server-only; never sent to a browser
  }

  private params(req: GenerateRequest): GenerateContentParameters {
    return {
      model: req.model,
      contents: toContents(req.messages),
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.jsonSchema ? 0 : 0.3,
        abortSignal: req.signal,
        ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: withoutMeta(req.jsonSchema) } : {}),
      },
    };
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamChunk> {
    let response: AsyncGenerator<import("@google/genai").GenerateContentResponse>;
    try {
      response = await this.client.models.generateContentStream(this.params(req));
    } catch (error) {
      throw normalise(error, req.signal);
    }
    let usage = { inputTokens: 0, outputTokens: 0 };
    let blocked = false;
    try {
      for await (const chunk of response) {
        if (chunk.promptFeedback?.blockReason) blocked = true;
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.thought) continue; // never show internal reasoning
          if (part.text) yield { type: "text", text: part.text };
        }
        const meta = chunk.usageMetadata;
        if (meta) {
          usage = {
            inputTokens: meta.promptTokenCount ?? usage.inputTokens,
            outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) || usage.outputTokens,
          };
        }
      }
    } catch (error) {
      throw normalise(error, req.signal);
    }
    if (blocked) throw new ProviderError("refused", "safety_block");
    yield { type: "usage", usage };
  }

  complete(req: GenerateRequest): Promise<Completion> {
    return collect(this.stream(req));
  }
}
