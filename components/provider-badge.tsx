import type { ProviderStatus } from "@/lib/ai/status";

/** A labelled pill: filled square = real model, outline square = mock. */
export function ProviderBadge({ status, className = "" }: { status: ProviderStatus; className?: string }) {
  const real = status.active === "gemini";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink ${className}`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        {real ? (
          <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
        ) : (
          <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.4" />
        )}
      </svg>
      <span>
        <span className="sr-only">Active AI provider: </span>
        {status.label}
      </span>
    </span>
  );
}
