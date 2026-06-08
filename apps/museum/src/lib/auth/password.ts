import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id defaults tuned for interactive login (~50-100ms on modern hardware).
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export function verifyPassword(
  digest: string,
  password: string
): Promise<boolean> {
  return verify(digest, password);
}
