import type { z } from "zod";

/** Zod issues -> { field: first message }, for the error summary. */
export function fieldErrorsClient(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (key === "clientRequestId") continue;
    out[key] ??= issue.message;
  }
  return out;
}
