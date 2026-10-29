import type { Severity } from "@/lib/ai/schemas";

// Severity and status are told apart by TEXT plus SHAPE, never colour:
//   info    = outline circle      warning = filled triangle
//   error   = filled octagon (and the finding card gets a thick double border)

export function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "info") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="4.8" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.2 15.2 14H.8Z" fill="currentColor" />
        <path d="M8 5.5v4" stroke="var(--page)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.8" r="1" fill="var(--page)" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2Z" fill="currentColor" />
      <path d="M5.5 5.5l5 5m0-5-5 5" stroke="var(--page)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = { info: "Info", warning: "Warning", error: "Error" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink ${
        severity === "error" ? "border-2 border-strong" : severity === "warning" ? "border border-strong" : "border border-dashed border-line"
      }`}
    >
      <SeverityIcon severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const STATUS: Record<string, { label: string; shape: "dot" | "ring" | "square" | "dashed" | "octagon" | "lock" | "half" }> = {
  ok: { label: "Answered", shape: "dot" },
  pending: { label: "In progress", shape: "ring" },
  invalid_output: { label: "Unstructured answer", shape: "square" },
  refused: { label: "Declined", shape: "square" },
  error: { label: "Error", shape: "octagon" },
  timeout: { label: "Timed out", shape: "octagon" },
  rate_limited: { label: "Rate-limited", shape: "octagon" },
  fallback_mock: { label: "Mock answer (fallback)", shape: "dashed" },
  blocked_secret: { label: "Blocked: secret found", shape: "lock" },
  interrupted: { label: "Stopped early", shape: "half" },
};

export const statusLabel = (status: string) => STATUS[status]?.label ?? status;

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, shape: "ring" as const };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        {s.shape === "dot" && <circle cx="6" cy="6" r="5" fill="currentColor" />}
        {s.shape === "ring" && <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />}
        {s.shape === "square" && <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" />}
        {s.shape === "dashed" && <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" />}
        {s.shape === "octagon" && <path d="M4 .8h4L11.2 4v4L8 11.2H4L.8 8V4Z" fill="currentColor" />}
        {s.shape === "lock" && (
          <>
            <rect x="1.5" y="5" width="9" height="6.2" rx="1" fill="currentColor" />
            <path d="M3.5 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </>
        )}
        {s.shape === "half" && (
          <>
            <circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 1.2a4.8 4.8 0 0 1 0 9.6Z" fill="currentColor" />
          </>
        )}
      </svg>
      {s.label}
    </span>
  );
}
