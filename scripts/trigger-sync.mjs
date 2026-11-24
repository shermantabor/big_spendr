// Run by the Render cron job once a day: asks the web app to sync every bank
// connection. Needs APP_URL (the web app's https address) and CRON_SECRET (the
// same value the web app has). Uses no packages, so the cron job needs no build.

const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!appUrl || !secret) {
  console.error("[trigger-sync] APP_URL and CRON_SECRET must both be set.");
  process.exit(1);
}

// A free Render web service sleeps when idle and takes about a minute to wake,
// so allow a long timeout and retry once.
async function attempt() {
  const res = await fetch(`${appUrl}/api/cron/sync`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text;
}

try {
  console.log("[trigger-sync]", await attempt());
} catch (err) {
  console.error("[trigger-sync] first attempt failed:", err.message);
  await new Promise((r) => setTimeout(r, 30_000));
  try {
    console.log("[trigger-sync]", await attempt());
  } catch (err2) {
    console.error("[trigger-sync] failed:", err2.message);
    process.exit(1);
  }
}
