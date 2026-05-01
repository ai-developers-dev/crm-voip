"use node";

/**
 * Per-org AES-256-GCM encryption helper for Convex actions.
 *
 * Mirrors `src/lib/credentials/crypto.ts` (which is the helper for
 * Next.js routes) so values encrypted on either side decrypt cleanly
 * on the other. Same algorithm, same IV size, same auth tag size,
 * same `iv:ciphertext:tag` (base64) wire format.
 *
 * Convex needs its own copy because actions on Convex's runtime
 * cannot import from the Next.js `src/` directory (different
 * bundles, different runtime).
 *
 * The master key lives in `CREDENTIAL_ENCRYPTION_KEY` (Convex env var).
 * The per-org key is derived via HMAC-SHA256(masterKey, orgId) so
 * each tenant's data is encrypted with a unique key — a leak of one
 * tenant's ciphertext doesn't compromise others.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function deriveKey(orgId: string): Buffer {
  const masterKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set on the Convex deployment. Run `npx convex env set CREDENTIAL_ENCRYPTION_KEY <hex>`.",
    );
  }
  return createHmac("sha256", Buffer.from(masterKey, "hex"))
    .update(orgId)
    .digest();
}

export function encrypt(plaintext: string, orgId: string): string {
  const key = deriveKey(orgId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

export function decrypt(encoded: string, orgId: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Invalid encrypted value lengths");
  }
  const key = deriveKey(orgId);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
