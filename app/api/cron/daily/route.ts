import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runDaily } from "@/lib/services/cron";
import { json } from "@/lib/http";

// GET /api/cron/daily, scheduled in vercel.json. Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; anything else gets 401.
// The job is idempotent, so a retry or a manual call is safe.

function authorised(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false; // no secret configured = cron disabled, never open
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: Request) {
  if (!authorised(request)) return json({ error: "unauthorised" }, 401);
  const details = await runDaily("schedule");
  return json({ ok: true, details });
}
