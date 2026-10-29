// Shared by server and browser: no secrets, no server-only imports.

export const MODES = ["explain", "generate", "review", "fix", "tests", "convert"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_INFO: Record<Mode, { label: string; blurb: string; streams: boolean }> = {
  explain: { label: "Explain", blurb: "What the code does, group of lines by group of lines, at your level.", streams: true },
  generate: { label: "Generate", blurb: "Describe what you want; get code streamed in, with the assumptions made.", streams: true },
  review: { label: "Review", blurb: "Structured findings: severity, line range, problem and a suggested fix.", streams: false },
  fix: { label: "Fix an error", blurb: "Paste code and the error; get the likely cause and a corrected version as a diff.", streams: false },
  tests: { label: "Write tests", blurb: "Unit tests for your code in the framework you choose.", streams: true },
  convert: { label: "Convert", blurb: "Translate between languages, with notes on what doesn't map cleanly.", streams: true },
};

export const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "java", label: "Java" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "sql", label: "SQL" },
  { id: "html_css", label: "HTML/CSS" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [Language, ...Language[]];
export const languageLabel = (id: string): string => LANGUAGES.find((l) => l.id === id)?.label ?? id;

export const LEVELS = ["beginner", "intermediate", "expert"] as const;
export type Level = (typeof LEVELS)[number];

/** Suggested test frameworks per language (free text is also accepted). */
export const TEST_FRAMEWORKS: Record<Language, string> = {
  javascript: "vitest",
  typescript: "vitest",
  python: "pytest",
  php: "phpunit",
  java: "junit5",
  csharp: "xunit",
  go: "testing",
  sql: "pgtap",
  html_css: "playwright",
};

export const RUN_STATUSES = [
  "pending", "ok", "invalid_output", "refused", "error", "timeout",
  "rate_limited", "fallback_mock", "blocked_secret", "interrupted",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Limits. Each one protects something specific, and on a free tier with a
 * few requests per minute and a daily quota they matter even more:
 * - MAX_INPUT_CHARS: long inputs cost tokens (and quota) on every call and
 *   make answers slower and vaguer; 12k chars is roughly 3k tokens.
 * - MAX_EXTRA_CHARS: an error message or description, not a novel.
 * - PER_MINUTE: stops a stuck button or a script from draining the
 *   provider's per-minute quota for everyone sharing the key.
 * - DAILY_RUNS: one person can't use the whole day's free quota.
 * - MAX_OUTPUT_TOKENS: caps cost and latency of a single answer, and stops
 *   a runaway generation.
 * - DEMO_DAILY_RUNS: the no-sign-up demo gets a small allowance per visitor.
 */
export const LIMITS = {
  MAX_INPUT_CHARS: 12_000,
  MAX_EXTRA_CHARS: 4_000,
  PER_MINUTE: 6,
  DAILY_RUNS: 40,
  DEMO_DAILY_RUNS: 6,
  DEMO_STARTS_PER_IP_PER_DAY: 5,
  MAX_OUTPUT_TOKENS: 2_048,
  MAX_OUTPUT_CHARS: 16_000,
  REQUEST_TIMEOUT_MS: 45_000,
} as const;
