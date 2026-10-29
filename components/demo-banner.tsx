import type { ProviderStatus } from "@/lib/ai/status";
import { LIMITS } from "@/lib/constants";

export function DemoBanner({ status }: { status: ProviderStatus }) {
  return (
    <div role="note" className="mb-6 rounded-md border-2 border-dashed border-strong p-3 text-sm text-ink">
      <strong>Demo mode.</strong> You&apos;re using a temporary account that is deleted after 24 hours, with {LIMITS.DEMO_DAILY_RUNS} runs. Answers come from{" "}
      <strong>{status.active === "mock" ? "the built-in mock (placeholder answers, not a real model)" : status.label}</strong>.
    </div>
  );
}
