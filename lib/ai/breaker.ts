import "server-only";

// A tiny circuit breaker. When the real provider keeps failing with
// rate-limit or "unreachable" errors, stop hammering it for a while and
// answer from the mock instead (clearly labelled). Kept in memory, so on
// serverless each instance has its own breaker. That's fine here: it only
// saves wasted calls, and the real limits live in Postgres.

const OPEN_FOR_MS = 60_000;
const TRIP_AFTER = 2;

let consecutiveFailures = 0;
let openUntil = 0;

export function breakerOpen(): boolean {
  return Date.now() < openUntil;
}

export function recordProviderFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= TRIP_AFTER) openUntil = Date.now() + OPEN_FOR_MS;
}

export function recordProviderSuccess(): void {
  consecutiveFailures = 0;
  openUntil = 0;
}

/** For the check script. */
export function resetBreaker(): void {
  consecutiveFailures = 0;
  openUntil = 0;
}
