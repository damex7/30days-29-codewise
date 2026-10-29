// SECRETS SCANNER: runs BEFORE anything is sent to the AI provider.
// Free tiers may use prompts for training, and anything sent leaves our
// control, so a pasted API key or password must never reach the provider.
//
// If a likely secret is found the provider is NOT called. The user sees
// the line numbers and the kind of secret (never the value), and can choose
// "Mask and continue", which replaces each value with a placeholder like
// <REDACTED_API_KEY>. The detected value is never stored or logged: a
// blocked run saves only line numbers and kinds (see the runs CHECK).
//
// Honest limits:
// - False positives: a long random-looking test fixture, a placeholder
//   such as password = "changeme", or a public key may be flagged. Masking
//   costs little, so we prefer to over-warn.
// - False negatives: a password in a plain string with no telling variable
//   name, a custom token format, a key split across lines, or one encoded
//   in base64 will slip through. Pattern matching can't know what is
//   secret; it only recognises common shapes. Don't paste private code.

export interface SecretFinding {
  line: number;
  kind: string;
  label: string;
  /** Set by the run service: the code box or the error/details box. */
  where?: "code" | "details";
}

interface Rule {
  kind: string;
  label: string;
  /** Must match the VALUE only (group "v" if present), so masking replaces just that. */
  pattern: RegExp;
}

// Each pattern uses a named group "v" for the part to mask.
const RULES: Rule[] = [
  { kind: "aws_access_key", label: "AWS access key ID", pattern: /\b(?<v>(?:AKIA|ASIA)[0-9A-Z]{16})\b/g },
  { kind: "github_token", label: "GitHub token", pattern: /\b(?<v>(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { kind: "openai_key", label: "API key (sk-…)", pattern: /\b(?<v>sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,})\b/g },
  { kind: "google_api_key", label: "Google API key", pattern: /\b(?<v>AIza[0-9A-Za-z_\-]{35})\b/g },
  { kind: "stripe_key", label: "Stripe/Paystack secret key", pattern: /\b(?<v>(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,})\b/g },
  { kind: "slack_token", label: "Slack token", pattern: /\b(?<v>xox[abprs]-[0-9A-Za-z-]{10,})\b/g },
  { kind: "jwt", label: "JSON Web Token", pattern: /\b(?<v>eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g },
  // postgres://user:PASSWORD@host, mongodb+srv://..., mysql://... : mask the password part.
  { kind: "connection_string", label: "Connection string with a password", pattern: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@'"]+:(?<v>[^\s@'"]{3,})@[^\s'"]+/gi },
  // KEY=value / "apiKey": "value" / password: 'value' with a telling name.
  {
    kind: "env_secret",
    label: "Secret-looking assignment (KEY / SECRET / TOKEN / PASSWORD)",
    pattern:
      /\b[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|AUTH)[A-Za-z0-9_]*["']?\s*[:=]\s*["'`]?(?<v>[^\s"'`;,]{6,})/gi,
  },
];

// A private key is a multi-line block; handled separately.
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )?PRIVATE KEY-----|$)/g;

// Values that are obviously not secrets: placeholders, env lookups, empty.
const HARMLESS = /^(?:x+|\*+|\.{3,}|<[^>]*>|\$\{?[A-Z_]+\}?|process\.env\.[\w.]+|os\.environ.*|env\(.*|getenv.*|true|false|null|none|undefined|changeme|example|placeholder|your[_-]?\w*|redacted.*|<REDACTED_[A-Z_]+>)$/i;

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

export function scanForSecrets(text: string): SecretFinding[] {
  const found: SecretFinding[] = [];
  const seen = new Set<string>();
  const add = (line: number, kind: string, label: string) => {
    const key = `${line}:${kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ line, kind, label });
    }
  };

  for (const m of text.matchAll(PRIVATE_KEY_BLOCK)) add(lineOf(text, m.index), "private_key", "Private key block");

  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const value = m.groups?.v ?? m[0];
      if (HARMLESS.test(value)) continue;
      // env_secret: skip values that are clearly code, like password = req.body.password
      if (rule.kind === "env_secret" && /^[a-z_$][\w$]*(?:\.[\w$]+)+$|^[a-z_$][\w$]*\(/i.test(value)) continue;
      // Function parameters and variable references like `password = password` are not secrets.
      if (rule.kind === "env_secret" && /^[a-z_$][\w$]*$/i.test(value) && !/\d/.test(value) && value.length < 16) continue;
      const offset = m.index + (m[0].indexOf(value) >= 0 ? m[0].indexOf(value) : 0);
      add(lineOf(text, offset), rule.kind, rule.label);
    }
  }
  // The generic "KEY=value" rule adds nothing when a specific rule already
  // named the secret on that line.
  const specific = new Set(found.filter((f) => f.kind !== "env_secret").map((f) => f.line));
  return found
    .filter((f) => f.kind !== "env_secret" || !specific.has(f.line))
    .sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}

const PLACEHOLDER: Record<string, string> = {
  private_key: "<REDACTED_PRIVATE_KEY>",
  connection_string: "<REDACTED_PASSWORD>",
  env_secret: "<REDACTED_SECRET>",
  jwt: "<REDACTED_JWT>",
};
const placeholderFor = (kind: string) => PLACEHOLDER[kind] ?? "<REDACTED_API_KEY>";

/** "Mask and continue": replace every detected value with a placeholder. */
export function maskSecrets(text: string): string {
  let out = text.replace(PRIVATE_KEY_BLOCK, placeholderFor("private_key"));
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      const match = args[0] as string;
      const groups = args[args.length - 1] as { v?: string } | undefined;
      const value = groups?.v;
      if (!value || HARMLESS.test(value)) return match;
      if (rule.kind === "env_secret" && /^[a-z_$][\w$]*(?:\.[\w$]+)+$|^[a-z_$][\w$]*\(/i.test(value)) return match;
      if (rule.kind === "env_secret" && /^[a-z_$][\w$]*$/i.test(value) && !/\d/.test(value) && value.length < 16) return match;
      const at = match.lastIndexOf(value);
      return match.slice(0, at) + placeholderFor(rule.kind) + match.slice(at + value.length);
    });
  }
  return out;
}
