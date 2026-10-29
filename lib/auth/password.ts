import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing with scrypt (built into Node, no library).
// - scrypt is deliberately slow and memory-hungry, so a stolen hash table
//   can't be brute-forced at billions of guesses per second like SHA-256.
// - Each user gets their own random 16-byte salt, so two people with the
//   same password get different hashes and precomputed tables are useless.
// - Stored as "scrypt$N$r$p$salt$hash" so the cost can be raised later.

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  // timingSafeEqual takes the same time whether the first or last byte
  // differs, so response timing leaks nothing about the hash.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used when the email doesn't exist, so "unknown email" takes as long as
// "wrong password" and timing can't reveal which accounts exist.
const DUMMY = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY);
}
