import { NextResponse } from "next/server";
import { syncAllItems } from "@/lib/sync";

export const maxDuration = 300;

/**
 * Daily backup sync. Render's cron job (see render.yaml and
 * scripts/trigger-sync.mjs) calls this once a day. Webhooks normally keep
 * things current; this catches anything a webhook missed.
 * Requires "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await syncAllItems();
  console.log("[cron] sync results", JSON.stringify(results));
  return NextResponse.json({ results });
}
