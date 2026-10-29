import "server-only";
import { z } from "zod";

// Environment variables, parsed once with Zod so a typo fails loudly with
// a clear message instead of as "undefined" deep inside a request.
// Everything here is server-only: GEMINI_API_KEY never reaches a browser.

const schema = z.object({
  APP_URL: z.url().default("http://localhost:3029"),
  AI_PROVIDER: z.enum(["gemini", "mock"]).default("gemini"),
  GEMINI_API_KEY: z.string().trim().optional().transform((v) => v || undefined),
  AI_MODEL: z.string().trim().min(1).default("gemini-3.5-flash-lite"),
  AI_FAST_MODEL: z.string().trim().min(1).default("gemini-3.1-flash-lite"),
  RESEND_API_KEY: z.string().trim().optional().transform((v) => v || undefined),
  EMAIL_FROM: z.string().trim().default("Codewise <onboarding@resend.dev>"),
  CRON_SECRET: z.string().trim().optional().transform((v) => v || undefined),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  cached = parsed.data;
  return cached;
}
