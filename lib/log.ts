import "server-only";

// Structured server logs that are safe to ship anywhere.
// Rule: logs carry ids, counts, durations and status codes. Never the
// pasted code, never model output, never an email address, never a secret.
// Strings are still passed through mask() as a second line of defence, in
// case someone logs the wrong field one day.

type Field = string | number | boolean | null | undefined;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Long base64/hex-ish runs look like keys or tokens: keep only a prefix.
const TOKENISH = /\b[A-Za-z0-9_\-]{24,}\b/g;
const MAX_STRING = 120;

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function mask(value: string): string {
  return value
    .replace(EMAIL, (m) => maskEmail(m))
    .replace(TOKENISH, (m) => (/^[0-9a-f-]{36}$/i.test(m) ? m : `${m.slice(0, 4)}…[masked]`))
    .slice(0, MAX_STRING);
}

/** Sink is swappable so the check script can capture and inspect log lines. */
let sink: (line: string) => void = (line) => console.log(line);
export function setLogSink(fn: (line: string) => void): void {
  sink = fn;
}

export function log(event: string, fields: Record<string, Field> = {}): void {
  const safe: Record<string, Field> = {};
  for (const [k, v] of Object.entries(fields)) safe[k] = typeof v === "string" ? mask(v) : v;
  sink(JSON.stringify({ t: new Date().toISOString(), event, ...safe }));
}
