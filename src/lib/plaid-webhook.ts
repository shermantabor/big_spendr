import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { plaid } from "@/lib/plaid";

// Verifies the Plaid-Verification header on incoming webhooks, following
// https://plaid.com/docs/api/webhooks/webhook-verification/
// so nobody else can poke the webhook endpoint into doing work.

const keyCache = new Map<string, { jwk: JWK; expiredAt: number | null }>();

async function getKey(kid: string) {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const res = await plaid().webhook.getVerificationKey({ key_id: kid });
  const entry = { jwk: res.key as unknown as JWK, expiredAt: res.key.expired_at };
  keyCache.set(kid, entry);
  return entry;
}

export async function verifyPlaidWebhook(rawBody: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || !header.kid) return false;

    const { jwk, expiredAt } = await getKey(header.kid);
    if (expiredAt !== null) return false;

    const key = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(token, key, { algorithms: ["ES256"], maxTokenAge: "5 min" });

    const claimed = String(payload.request_body_sha256 ?? "");
    const actual = createHash("sha256").update(rawBody).digest("hex");
    return claimed.length === actual.length && timingSafeEqual(Buffer.from(claimed), Buffer.from(actual));
  } catch (err) {
    console.error("[webhook] verification failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
