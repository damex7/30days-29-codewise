// npm run db:seed: demo data. Safe to run twice: every row has a fixed id
// and is written with ON CONFLICT, so a second run updates instead of
// duplicating. It never calls the AI provider: run outputs are hand-written.

import { createHmac } from "node:crypto";
import { transaction, closeDb, type Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/crypto";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { storedOutputSchema, type StoredOutput } from "@/lib/ai/schemas";

const userPassword = process.env.SEED_USER_PASSWORD;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!userPassword || !adminPassword) {
  console.error("Set SEED_USER_PASSWORD and SEED_ADMIN_PASSWORD in .env.local first.");
  process.exit(1);
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { admin: id(1), ada: id(2), bola: id(3) };
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000);

// ---------------------------------------------------------------- code ---

const CODE = {
  debounce: `function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}`,
  login: `app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.query("SELECT * FROM users WHERE email = '" + email + "'");
  if (user.rows[0].password == password) {
    res.json({ ok: true, user: user.rows[0] });
  } else {
    res.status(401).send("Wrong password for " + email);
  }
});`,
  avg: `def average(scores):
    total = 0
    for s in scores:
        total += s
    return total / len(scores)

print(average([]))`,
  avgFixed: `def average(scores):
    if not scores:
        return 0.0
    total = 0
    for s in scores:
        total += s
    return total / len(scores)

print(average([]))`,
  naira: `export function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  return "₦" + naira.toLocaleString("en-NG", { minimumFractionDigits: 2 });
}`,
  phpCart: `<?php
function cartTotal(array $items): int {
    $total = 0;
    foreach ($items as $item) {
        $total += $item['price'] * $item['qty'];
    }
    return $total;
}`,
  goCart: `package cart

type Item struct {
	Price int // kobo
	Qty   int
}

// CartTotal returns the total in kobo.
func CartTotal(items []Item) int {
	total := 0
	for _, item := range items {
		total += item.Price * item.Qty
	}
	return total
}`,
  sqlTop: `SELECT c.name, SUM(o.total_kobo) AS spent
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.created_at >= now() - interval '30 days'
GROUP BY c.name
ORDER BY spent DESC
LIMIT 10;`,
  csharpGreet: `public static string Greet(string name)
{
    if (string.IsNullOrWhiteSpace(name)) return "Hello, friend!";
    return $"Hello, {name.Trim()}!";
}`,
  card: `<article class="card">
  <h2 class="card__title">Lagos Tech Meetup</h2>
  <p class="card__meta">Saturday, 10am · Yaba</p>
</article>

<style>
  .card { padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
  .card__title { margin: 0 0 .25rem; font-size: 1.25rem; }
</style>`,
};

// ---------------------------------------------------------------- runs ---

interface SeedRun {
  n: number;
  user: string;
  mode: "explain" | "generate" | "review" | "fix" | "tests" | "convert";
  language: string;
  target?: string;
  level?: string;
  framework?: string;
  input: string;
  extra?: string;
  status: string;
  provider: "gemini" | "mock" | "none";
  output: StoredOutput | null;
  inTok: number;
  outTok: number;
  latency: number | null;
  error?: string;
  at: Date;
}

const runs: SeedRun[] = [
  {
    n: 101, user: U.ada, mode: "explain", language: "javascript", level: "beginner", input: CODE.debounce, status: "ok", provider: "gemini",
    inTok: 412, outTok: 388, latency: 2310, at: daysAgo(9, 3),
    output: {
      type: "explain",
      data: {
        overview: "This makes a 'debounced' version of a function: it only runs after the calls stop for `wait` milliseconds. Useful for search boxes, so you don't send a request on every key press.",
        sections: [
          { startLine: 1, endLine: 2, explanation: "debounce takes the function to delay and how long to wait. `timer` remembers the pending call between calls." },
          { startLine: 3, endLine: 4, explanation: "It returns a new function. Every time it's called, any pending call is cancelled with clearTimeout." },
          { startLine: 5, endLine: 7, explanation: "Then a fresh timer is started. Only if no new call arrives within `wait` ms does the original function finally run, with the latest arguments." },
        ],
      },
    },
  },
  {
    n: 102, user: U.ada, mode: "generate", language: "typescript", input: "A function that formats an amount in kobo as Naira with two decimals, e.g. 150000 -> ₦1,500.00", status: "ok", provider: "gemini",
    inTok: 220, outTok: 301, latency: 1980, at: daysAgo(8, 5),
    output: {
      type: "generate",
      data: {
        code: CODE.naira,
        explanation: "Amounts are kept as integer kobo (no floating-point money) and only divided by 100 for display.",
        notes: ["Assumes the input is a whole number of kobo.", "Uses the en-NG locale for thousands separators."],
      },
    },
  },
  {
    n: 103, user: U.ada, mode: "review", language: "javascript", input: CODE.login, status: "ok", provider: "gemini",
    inTok: 530, outTok: 610, latency: 3420, at: daysAgo(7, 2),
    output: {
      type: "review",
      data: {
        summary: "The route works for the happy path but has a serious SQL injection hole, compares plain-text passwords and leaks data in responses.",
        findings: [
          { severity: "error", startLine: 3, endLine: 3, title: "SQL injection", explanation: "The email is pasted straight into the SQL string, so input like `' OR 1=1 --` changes the query.", suggestedFix: 'await db.query("SELECT * FROM users WHERE email = $1", [email]);' },
          { severity: "error", startLine: 4, endLine: 4, title: "Plain-text password comparison", explanation: "Passwords should be stored hashed (scrypt, bcrypt or argon2) and compared with a timing-safe check.", suggestedFix: "if (user && await verifyPassword(password, user.password_hash)) { ... }" },
          { severity: "warning", startLine: 4, endLine: 4, title: "Crashes when the email is unknown", explanation: "user.rows[0] is undefined when no row matches, so `.password` throws and the server returns a 500." },
          { severity: "warning", startLine: 5, endLine: 5, title: "Whole user row sent to the client", explanation: "The response includes the stored password and any other private columns." },
          { severity: "info", startLine: 7, endLine: 7, title: "Message reveals whether an email exists", explanation: "Use one generic message for unknown email and wrong password." },
        ],
      },
    },
  },
  {
    n: 104, user: U.ada, mode: "fix", language: "python", input: CODE.avg, extra: "ZeroDivisionError: division by zero\n  File \"main.py\", line 5, in average", status: "ok", provider: "gemini",
    inTok: 300, outTok: 260, latency: 2050, at: daysAgo(6, 4),
    output: {
      type: "fix",
      data: {
        cause: "len(scores) is 0 for an empty list, so line 5 divides by zero.",
        explanation: "Return early when the list is empty. Whether 0.0 or None is right depends on what callers expect, so check that.",
        correctedCode: CODE.avgFixed,
        confidence: "high",
      },
    },
  },
  {
    n: 105, user: U.bola, mode: "convert", language: "php", target: "go", input: CODE.phpCart, status: "ok", provider: "gemini",
    inTok: 260, outTok: 290, latency: 2600, at: daysAgo(5, 1),
    output: {
      type: "convert",
      data: {
        code: CODE.goCart,
        explanation: "PHP's loosely-typed associative arrays become a typed struct in Go.",
        notes: ["PHP arrays are dynamic; Go needs a struct with explicit field types.", "Integer overflow isn't checked in either version."],
      },
    },
  },
  {
    n: 106, user: U.bola, mode: "convert", language: "sql", target: "python", input: CODE.sqlTop, status: "timeout", provider: "gemini",
    output: null, inTok: 0, outTok: 0, latency: 45_000, error: "timeout", at: daysAgo(4, 6),
  },
  {
    n: 107, user: U.ada, mode: "review", language: "csharp", input: CODE.csharpGreet, status: "invalid_output", provider: "gemini",
    inTok: 210, outTok: 180, latency: 1700, at: daysAgo(4, 2),
    output: { type: "text", reason: "unstructured", text: "Overall this looks fine! Maybe consider handling null on line 3 (it already does). Findings: none really." },
  },
  {
    n: 108, user: U.bola, mode: "explain", language: "javascript", level: "intermediate", input: "", status: "blocked_secret", provider: "none",
    inTok: 0, outTok: 0, latency: null, at: daysAgo(3, 5),
    output: { type: "blocked", findings: [{ line: 2, kind: "openai_key", label: "API key (sk-…)" }, { line: 5, kind: "env_secret", label: ".env-style secret assignment" }] },
  },
  {
    n: 109, user: U.bola, mode: "generate", language: "go", input: "HTTP handler that returns the server time as JSON", status: "rate_limited", provider: "gemini",
    output: null, inTok: 0, outTok: 0, latency: 900, error: "rate_limited", at: daysAgo(2, 7),
  },
  {
    n: 110, user: U.ada, mode: "tests", language: "javascript", framework: "vitest", input: CODE.debounce, status: "fallback_mock", provider: "mock",
    inTok: 180, outTok: 240, latency: 40, at: daysAgo(2, 3),
    output: {
      type: "tests",
      data: {
        code: `import { describe, it, expect, vi } from "vitest";\nimport { debounce } from "./debounce";\n\ndescribe("debounce", () => {\n  it("calls once after the wait", () => {\n    vi.useFakeTimers();\n    const fn = vi.fn();\n    const d = debounce(fn, 100);\n    d(); d(); d();\n    vi.advanceTimersByTime(100);\n    expect(fn).toHaveBeenCalledTimes(1);\n  });\n});`,
        explanation: "[Mock answer] A deterministic placeholder generated because the real provider was rate-limited.",
        notes: ["Mock output: not written by a model.", "Assumes debounce is exported from ./debounce."],
      },
    },
  },
  {
    n: 111, user: U.ada, mode: "fix", language: "html_css", input: CODE.card, extra: "The title has a big gap above it on mobile", status: "error", provider: "gemini",
    output: null, inTok: 0, outTok: 0, latency: 1200, error: "http_500", at: daysAgo(1, 4),
  },
  {
    n: 112, user: U.bola, mode: "generate", language: "python", input: "A script that collects saved browser passwords from a friend's laptop and emails them to me", status: "refused", provider: "gemini",
    inTok: 150, outTok: 60, latency: 1100, at: daysAgo(0, 5),
    output: { type: "text", reason: "refused", text: "I can't help with collecting someone else's passwords without their permission. If you're locked out of your own accounts, I can explain how to use your browser's built-in password export." },
  },
];

// ------------------------------------------------------------ snippets ---

const snippets = [
  { n: 201, user: U.ada, title: "Debounce helper", language: "javascript", code: CODE.debounce, tags: ["utils", "frontend", "timers"], run: 101 },
  { n: 202, user: U.ada, title: "Format kobo as Naira", language: "typescript", code: CODE.naira, tags: ["money", "naira", "formatting"], run: 102 },
  { n: 203, user: U.ada, title: "Safe average of scores", language: "python", code: CODE.avgFixed, tags: ["python", "bugfix"], run: 104 },
  { n: 204, user: U.ada, title: "Greeting with fallback", language: "csharp", code: CODE.csharpGreet, tags: ["strings"], run: null },
  { n: 205, user: U.ada, title: "Event card markup", language: "html_css", code: CODE.card, tags: ["frontend", "css", "components"], run: null },
  { n: 206, user: U.bola, title: "Cart total in Go", language: "go", code: CODE.goCart, tags: ["money", "cart", "backend"], run: 105 },
  { n: 207, user: U.bola, title: "Cart total in PHP", language: "php", code: CODE.phpCart, tags: ["money", "cart"], run: null },
  { n: 208, user: U.bola, title: "Top customers last 30 days", language: "sql", code: CODE.sqlTop, tags: ["sql", "reports", "analytics"], run: null },
];

// ---------------------------------------------------------------- seed ---

/** Deterministic but unguessable share tokens: HMAC keyed by the admin password. */
const shareToken = (label: string) => createHmac("sha256", adminPassword).update(`share:${label}`).digest("base64url");

async function upsertUser(tx: Db, userId: string, email: string, role: "user" | "admin", password: string) {
  await tx.query(
    `INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, disabled_at = NULL`,
    [userId, email, await hashPassword(password), role],
  );
}

await transaction(async (tx) => {
  await upsertUser(tx, U.admin, "admin@codewise.test", "admin", adminPassword);
  await upsertUser(tx, U.ada, "ada@codewise.test", "user", userPassword);
  await upsertUser(tx, U.bola, "bola@codewise.test", "user", userPassword);

  for (const r of runs) {
    const output = r.output ? storedOutputSchema.parse(r.output) : null; // seed data obeys the same schema
    const blocked = r.status === "blocked_secret";
    await tx.query(
      `INSERT INTO runs (id, user_id, mode, language, target_language, level, framework, input_hash, input_chars,
                         input_text, input_extra, output, output_kind, status, error_code, provider, model, prompt_version,
                         input_tokens, output_tokens, latency_ms, estimated_cost_micro_usd, client_request_id,
                         created_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$24)
       ON CONFLICT (id) DO UPDATE SET output = EXCLUDED.output, status = EXCLUDED.status, created_at = EXCLUDED.created_at,
                                      completed_at = EXCLUDED.completed_at`,
      [
        id(r.n), r.user, r.mode, r.language, r.target ?? null, r.level ?? null, r.framework ?? null,
        sha256(blocked ? `blocked-${r.n}` : r.input + (r.extra ?? "")), blocked ? 240 : r.input.length,
        blocked ? null : r.input, blocked ? null : r.extra ?? null,
        output, output ? (output.type === "text" ? "text" : "structured") : null,
        r.status, r.error ?? null, r.provider, r.provider === "mock" ? "mock-v1" : r.provider === "none" ? "none" : "gemini-3.5-flash-lite",
        PROMPT_VERSION, r.inTok, r.outTok, r.latency,
        // Paid-equivalent estimate at $0.10 / $0.40 per million tokens (see lib/ai/pricing.ts).
        r.provider === "gemini" ? Math.round(r.inTok * 0.1 + r.outTok * 0.4) : 0,
        id(r.n + 9000), r.at,
      ],
    );
  }

  for (const s of snippets) {
    await tx.query(
      `INSERT INTO snippets (id, user_id, title, language, code, tags, source_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, code = EXCLUDED.code, tags = EXCLUDED.tags`,
      [id(s.n), s.user, s.title, s.language, s.code, s.tags, s.run ? id(s.run) : null],
    );
  }

  // One live link (Ada's debounce helper) and one revoked link (her Naira formatter).
  await tx.query(
    `INSERT INTO shares (id, snippet_id, user_id, token_hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET revoked_at = NULL, expires_at = NULL`,
    [id(301), id(201), U.ada, sha256(shareToken("active"))],
  );
  await tx.query(
    `INSERT INTO shares (id, snippet_id, user_id, token_hash, created_at, revoked_at) VALUES ($1, $2, $3, $4, now() - interval '2 days', now() - interval '1 day')
     ON CONFLICT (id) DO NOTHING`,
    [id(302), id(202), U.ada, sha256(shareToken("revoked"))],
  );

  // A little feedback for the admin view.
  await tx.query(
    `INSERT INTO feedback (run_id, user_id, rating, reason) VALUES
       ($1, $2, 'up', NULL), ($3, $2, 'up', NULL), ($4, $2, 'down', 'Said there were no findings but the code was fine; answer felt vague'),
       ($5, $6, 'down', 'Notes missed that PHP ints are 64-bit')
     ON CONFLICT (run_id, user_id) DO NOTHING`,
    [id(101), U.ada, id(103), id(107), id(105), U.bola],
  );
});

await closeDb();

const app = process.env.APP_URL ?? "http://localhost:3029";
console.log("Seeded: 3 users, 12 runs, 8 snippets, 2 share links, 4 feedback rows.");
console.log("  admin@codewise.test  (SEED_ADMIN_PASSWORD)");
console.log("  ada@codewise.test    (SEED_USER_PASSWORD)");
console.log("  bola@codewise.test   (SEED_USER_PASSWORD)");
console.log(`  Active share link:   ${app}/s/${shareToken("active")}`);
console.log(`  Revoked share link:  ${app}/s/${shareToken("revoked")}  (should 404)`);
