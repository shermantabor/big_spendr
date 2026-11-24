import "server-only";
import { PlaidClient, PlaidEnvironment, PlaidError } from "plaid";

const globalForPlaid = globalThis as unknown as { plaid?: PlaidClient };

export function plaidEnv(): "sandbox" | "production" {
  return process.env.PLAID_ENV === "production" ? "production" : "sandbox";
}

export function plaid(): PlaidClient {
  if (!globalForPlaid.plaid) {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    if (!clientId || !secret) throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set. See README.md.");
    globalForPlaid.plaid = new PlaidClient({
      environment: plaidEnv() === "production" ? PlaidEnvironment.Production : PlaidEnvironment.Sandbox,
      clientId,
      secret,
      maxRetries: 2,
      timeoutInSeconds: 60,
    });
  }
  return globalForPlaid.plaid;
}

export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Render sets this on web services, e.g. https://big-spendr.onrender.com
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Plaid can only call webhooks on a public https URL, so skip it for localhost. */
export function webhookUrl(): string | undefined {
  const url = `${appUrl()}/api/plaid/webhook`;
  return url.startsWith("https://") ? url : undefined;
}

type PlaidErrorBody = { error_code?: string; error_message?: string; error_type?: string };

function body(err: unknown): PlaidErrorBody | undefined {
  if (err instanceof PlaidError && err.body && typeof err.body === "object") return err.body as PlaidErrorBody;
  return undefined;
}

/** Plaid's error code (e.g. ITEM_LOGIN_REQUIRED), if this is a Plaid API error. */
export function plaidErrorCode(err: unknown): string | undefined {
  return body(err)?.error_code;
}

/** A message that's safe to log or show: never includes credentials. */
export function plaidErrorMessage(err: unknown): string {
  const b = body(err);
  if (b?.error_code) return `${b.error_code}: ${b.error_message ?? ""}`.trim();
  return err instanceof Error ? err.message : String(err);
}
