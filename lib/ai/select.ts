import "server-only";
import { env } from "@/lib/env";
import { GeminiProvider } from "@/lib/ai/gemini";
import { MockProvider } from "@/lib/ai/mock";
import { providerStatus } from "@/lib/ai/status";
import type { AiProvider } from "@/lib/ai/provider";

// Picks the provider for a call. AI_PROVIDER chooses ('gemini' | 'mock');
// with no GEMINI_API_KEY, or while the breaker is open after repeated
// rate-limit errors, the mock answers instead.

let gemini: GeminiProvider | null = null;
let mock: MockProvider | null = null;
let override: AiProvider | null = null;

export function mockProvider(): MockProvider {
  mock ??= new MockProvider();
  return mock;
}

export function getProvider(): { provider: AiProvider; model: string } {
  if (override) return { provider: override, model: override.name === "mock" ? "mock-v1" : env().AI_MODEL };
  const status = providerStatus();
  if (status.active === "mock") return { provider: mockProvider(), model: "mock-v1" };
  const key = env().GEMINI_API_KEY;
  if (!key) return { provider: mockProvider(), model: "mock-v1" };
  gemini ??= new GeminiProvider(key);
  return { provider: gemini, model: status.model };
}

/** Check script only: route every call through a given provider. */
export function setProviderOverride(provider: AiProvider | null, mockInstance?: MockProvider): void {
  override = provider;
  if (mockInstance) mock = mockInstance;
}
