import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, s } from "@/db";
import { verifyPlaidWebhook } from "@/lib/plaid-webhook";
import { syncItem } from "@/lib/sync";

export const maxDuration = 60;

type PlaidWebhook = {
  webhook_type: string;
  webhook_code: string;
  item_id?: string;
  error?: { error_code?: string } | null;
};

/**
 * Plaid calls this when something changes on a bank connection. The one that
 * matters most is TRANSACTIONS / SYNC_UPDATES_AVAILABLE: new or changed
 * transactions are ready, so we pull them right away.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyPlaidWebhook(raw, req.headers.get("plaid-verification"));
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const hook = JSON.parse(raw) as PlaidWebhook;
  console.log(`[webhook] ${hook.webhook_type}/${hook.webhook_code} item=${hook.item_id ?? "-"}`);
  if (!hook.item_id) return NextResponse.json({ ok: true });

  const [item] = await db.select().from(s.plaidItems).where(eq(s.plaidItems.plaidItemId, hook.item_id));
  if (!item) return NextResponse.json({ ok: true });

  const key = `${hook.webhook_type}/${hook.webhook_code}`;
  switch (key) {
    case "TRANSACTIONS/SYNC_UPDATES_AVAILABLE":
    case "TRANSACTIONS/INITIAL_UPDATE":
    case "TRANSACTIONS/HISTORICAL_UPDATE":
    case "TRANSACTIONS/DEFAULT_UPDATE":
      // Reply to Plaid quickly and do the sync right after the response.
      after(async () => {
        const r = await syncItem(item.id);
        console.log(`[webhook] synced ${r.institution}: +${r.added} ~${r.modified} -${r.removed} (${r.status})`);
      });
      break;
    case "ITEM/ERROR":
    case "ITEM/PENDING_EXPIRATION":
    case "ITEM/PENDING_DISCONNECT":
      await db
        .update(s.plaidItems)
        .set({ status: "login_required", errorCode: hook.error?.error_code ?? hook.webhook_code })
        .where(eq(s.plaidItems.id, item.id));
      break;
    case "ITEM/LOGIN_REPAIRED":
      await db.update(s.plaidItems).set({ status: "good", errorCode: null }).where(eq(s.plaidItems.id, item.id));
      break;
  }
  return NextResponse.json({ ok: true });
}
