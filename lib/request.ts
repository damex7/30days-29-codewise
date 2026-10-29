import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limit keys. On Vercel x-forwarded-for is
 * set by the platform; locally it's missing and everyone is "local".
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return ip.slice(0, 64);
}
