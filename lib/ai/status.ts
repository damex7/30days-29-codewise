import "server-only";
import { env } from "@/lib/env";
import { breakerOpen } from "@/lib/ai/breaker";

// Which provider answers right now, and why. Shown on the landing page,
// the workbench and the demo banner, so nobody mistakes a mock answer for
// the real model.

export interface ProviderStatus {
  active: "gemini" | "mock";
  reason: "configured" | "forced_mock" | "no_key" | "cooling_down";
  model: string;
  label: string;
}

export function providerStatus(): ProviderStatus {
  const e = env();
  if (e.AI_PROVIDER === "mock") {
    return { active: "mock", reason: "forced_mock", model: "mock-v1", label: "Mock provider (AI_PROVIDER=mock)" };
  }
  if (!e.GEMINI_API_KEY) {
    return { active: "mock", reason: "no_key", model: "mock-v1", label: "Mock provider (no GEMINI_API_KEY set)" };
  }
  if (breakerOpen()) {
    return { active: "mock", reason: "cooling_down", model: "mock-v1", label: "Mock provider (Gemini is rate-limited; retrying soon)" };
  }
  return { active: "gemini", reason: "configured", model: e.AI_MODEL, label: `Google Gemini (${e.AI_MODEL})` };
}
