// Estimated PAID cost of a call. On the free tier the real cost is 0, but
// the same traffic on a paid plan would cost money, and the admin view
// shows that so you can budget before going to production.
//
// Money is integer micro-dollars (1 USD = 1_000_000 µ$). Prices are kept
// as µ$ per MILLION tokens, which equals "µ$ per token × 1e6", so for a
// $0.10 / 1M price the per-token cost is exactly 0.1 µ$. We sum
// tokens × price first and divide once, rounding at the very end, so no
// floating-point fractions are stored.
//
// These are illustrative list prices; check the provider's pricing page
// before relying on them.

interface Price {
  /** µ$ per 1M input tokens (= USD per 1M × 1_000_000). */
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICES: Record<string, Price> = {
  "gemini-3.5-flash-lite": { inputPerMillion: 100_000, outputPerMillion: 400_000 },
  "gemini-3.1-flash-lite": { inputPerMillion: 75_000, outputPerMillion: 300_000 },
  "gemini-3.6-flash": { inputPerMillion: 300_000, outputPerMillion: 2_500_000 },
  "gemini-3.8-flash": { inputPerMillion: 500_000, outputPerMillion: 3_000_000 },
};

/** Unknown Gemini models are priced like the default lite model rather than as free. */
const FALLBACK: Price = { inputPerMillion: 100_000, outputPerMillion: 400_000 };

export function estimateCostMicroUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  if (provider !== "gemini") return 0; // the mock costs nothing, even hypothetically
  const price = PRICES[model] ?? FALLBACK;
  // Integer arithmetic: tokens × µ$-per-million, then one division.
  const total = inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion;
  return Math.round(total / 1_000_000);
}

/** 1234567 µ$ -> "$1.2346". Display only. */
export function formatMicroUsd(micro: number | bigint | string): string {
  const n = Number(micro);
  const dollars = Math.floor(n / 1_000_000);
  const rest = String(n % 1_000_000).padStart(6, "0").slice(0, 4);
  return `$${dollars.toLocaleString("en-US")}.${rest}`;
}
