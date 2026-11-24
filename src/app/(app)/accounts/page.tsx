import { asc, desc, eq } from "drizzle-orm";
import { db, s } from "@/db";
import { money } from "@/lib/format";
import { plaidEnv, webhookUrl } from "@/lib/plaid";
import { syncNow, removeItem, setAccountHidden, clearOtherEnvironment } from "@/app/actions/budget";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { SubmitButton } from "@/components/submit-button";

function ago(d: Date | null) {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default async function AccountsPage() {
  const env = plaidEnv();
  const [items, accts] = await Promise.all([
    db
      .select({
        id: s.plaidItems.id,
        institutionName: s.plaidItems.institutionName,
        status: s.plaidItems.status,
        plaidEnv: s.plaidItems.plaidEnv,
        errorCode: s.plaidItems.errorCode,
        lastSyncedAt: s.plaidItems.lastSyncedAt,
        linkedBy: s.users.name,
      })
      .from(s.plaidItems)
      .leftJoin(s.users, eq(s.plaidItems.linkedByUserId, s.users.id))
      .orderBy(desc(s.plaidItems.createdAt)),
    db.select().from(s.accounts).orderBy(asc(s.accounts.name)),
  ]);
  const otherEnv = env === "production" ? "sandbox" : "production";
  const otherEnvCount = items.filter((i) => i.plaidEnv !== env).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            New charges arrive automatically: Plaid tells the app when your bank posts something new, and a daily sync
            catches anything missed.
            {env === "sandbox" && (
              <> In sandbox, pick any bank and sign in with <code>user_transactions_dynamic</code> / any password for realistic data, or <code>user_good</code> / <code>pass_good</code>.</>
            )}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {items.length > 0 && (
            <form action={syncNow}>
              <SubmitButton pendingText="Syncing…">Sync all now</SubmitButton>
            </form>
          )}
          <PlaidLinkButton />
        </div>
      </div>

      {env === "production" && !webhookUrl() && (
        <div className="card border-amber-300 text-sm">
          <strong>Automatic updates are off.</strong> Set <code>APP_URL</code> to your https address in Render so Plaid
          can notify the app about new transactions, then reconnect or wait for the daily sync.
        </div>
      )}

      {otherEnvCount > 0 && (
        <div className="card space-y-3 border-amber-300 text-sm">
          <p>
            <strong>
              {otherEnvCount} test connection{otherEnvCount === 1 ? "" : "s"} from Plaid {otherEnv}.
            </strong>{" "}
            The app now uses Plaid {env}, so {otherEnvCount === 1 ? "it" : "they"} can&apos;t sync. Remove the test
            data so fake transactions don&apos;t mix into your totals and budget suggestions.
          </p>
          <form action={clearOtherEnvironment} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" name="resetCategories" defaultChecked /> Also remove categories and budgets that
              only had test transactions
            </label>
            <SubmitButton pendingText="Removing…" className="btn-ghost text-danger">
              Remove {otherEnv} data
            </SubmitButton>
          </form>
        </div>
      )}

      {env === "production" && (
        <p className="text-xs text-muted">
          On Plaid&apos;s free Trial plan you can connect up to 10 banks in total, and removing one doesn&apos;t give
          the slot back. Connect each bank once; if one stops working, use &ldquo;Fix connection&rdquo; instead of
          connecting it again.
        </p>
      )}

      {items.length === 0 && <div className="card text-sm text-muted">No accounts connected yet.</div>}

      {items.map((item) => (
        <section key={item.id} className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{item.institutionName ?? "Bank"}</h2>
              <p className="text-xs text-muted">
                Last synced {ago(item.lastSyncedAt)}
                {item.linkedBy ? ` · connected by ${item.linkedBy}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.plaidEnv !== env && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  Test data ({item.plaidEnv})
                </span>
              )}
              {item.plaidEnv === env && item.status !== "good" && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-200">
                  {item.status === "login_required" ? "Needs you to sign in again" : `Sync error (${item.errorCode})`}
                </span>
              )}
              {item.plaidEnv === env && item.status === "login_required" && (
                <PlaidLinkButton itemId={item.id} label="Fix connection" className="btn-ghost" />
              )}
              {item.plaidEnv === env && (
                <form action={syncNow}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <SubmitButton pendingText="Syncing…">Sync now</SubmitButton>
                </form>
              )}
              <form action={removeItem}>
                <input type="hidden" name="itemId" value={item.id} />
                <SubmitButton pendingText="Removing…" className="btn-ghost text-danger">Remove</SubmitButton>
              </form>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border text-sm">
            {accts
              .filter((a) => a.itemId === item.id)
              .map((a) => (
                <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${a.hidden ? "opacity-50" : ""}`}>
                  <span>
                    {a.name} {a.mask && <span className="text-muted">••{a.mask}</span>}
                    <span className="ml-2 text-xs text-muted">{a.subtype ?? a.type}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{a.currentBalance !== null ? money(a.currentBalance) : "—"}</span>
                    <form action={setAccountHidden}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="hidden" value={a.hidden ? "false" : "true"} />
                      <button className="text-xs text-muted underline hover:text-foreground" title="Hidden accounts are left out of spending totals">
                        {a.hidden ? "Include in spending" : "Exclude from spending"}
                      </button>
                    </form>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
