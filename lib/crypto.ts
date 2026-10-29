import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Hex SHA-256. Used for session/share token hashes and run input hashes. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * 32 random bytes (256 bits) as URL-safe base64. Long enough that guessing
 * a valid session cookie or share link is hopeless, so storing only a fast
 * hash of it (not a slow password hash) is enough.
 */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
