import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { Plaid } from "plaid";
import { db, s } from "@/db";
import { decrypt } from "@/lib/crypto";
import { plaid, plaidEnv, plaidErrorCode, plaidErrorMessage } from "@/lib/plaid";
import { createCategoryResolver } from "@/lib/categories";

export type SyncResult = {
  itemId: string;
  institution: string | null;
  added: number;
  modified: number;
  removed: number;
  status: "good" | "login_required" | "error";
  updateStatus?: string;
  error?: string;
};

const LOGIN_REQUIRED_CODES = new Set(["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT"]);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Pages through /transactions/sync from the saved cursor until has_more is false. */
async function fetchAllUpdates(accessToken: string, startCursor: string | null) {
  // Plaid can change data mid-pagination. When that happens, restart from the
  // cursor we started with, as Plaid's docs recommend.
  for (let attempt = 0; attempt < 3; attempt++) {
    const added: Plaid.Transaction[] = [];
    const modified: Plaid.Transaction[] = [];
    const removed: Plaid.RemovedTransaction[] = [];
    let accounts: Plaid.AccountBase[] = [];
    let cursor = startCursor ?? undefined;
    let updateStatus: string | undefined;
    try {
      for (;;) {
        const res = await plaid().transactions.sync({
          access_token: accessToken,
          cursor,
          count: 500,
          options: { include_personal_finance_category: true, days_requested: 730 },
        });
        added.push(...res.added);
        modified.push(...res.modified);
        removed.push(...res.removed);
        if (res.accounts?.length) accounts = res.accounts;
        updateStatus = res.transactions_update_status;
        cursor = res.next_cursor;
        if (!res.has_more) break;
      }
      return { added, modified, removed, accounts, nextCursor: cursor ?? null, updateStatus };
    } catch (err) {
      if (plaidErrorCode(err) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") continue;
      throw err;
    }
  }
  throw new Error("Plaid data kept changing during sync. Try again in a minute.");
}

async function upsertAccounts(itemId: string, list: Plaid.AccountBase[]) {
  for (const a of list) {
    const values = {
      plaidAccountId: a.account_id,
      itemId,
      name: a.name,
      officialName: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype ?? null,
      currentBalance: a.balances.current?.toString() ?? null,
      availableBalance: a.balances.available?.toString() ?? null,
      isoCurrencyCode: a.balances.iso_currency_code,
    };
    await db
      .insert(s.accounts)
      .values(values)
      .onConflictDoUpdate({
        target: s.accounts.plaidAccountId,
        set: {
          name: values.name,
          officialName: values.officialName,
          mask: values.mask,
          currentBalance: values.currentBalance,
          availableBalance: values.availableBalance,
          isoCurrencyCode: values.isoCurrencyCode,
        },
      });
  }
}

/** Fetches new, changed and removed transactions for one bank connection. */
export async function syncItem(itemId: string): Promise<SyncResult> {
  const [item] = await db.select().from(s.plaidItems).where(eq(s.plaidItems.id, itemId));
  if (!item) throw new Error(`No Plaid item ${itemId}`);
  const base = { itemId, institution: item.institutionName };
  if (item.plaidEnv !== plaidEnv()) {
    // A sandbox token can't be used against production (or vice versa).
    return {
      ...base, added: 0, modified: 0, removed: 0, status: "error",
      error: `This connection was made in Plaid ${item.plaidEnv} and can't sync while the app uses ${plaidEnv()}.`,
    };
  }

  let updates: Awaited<ReturnType<typeof fetchAllUpdates>>;
  try {
    updates = await fetchAllUpdates(decrypt(item.accessTokenEnc), item.cursor);
  } catch (err) {
    const code = plaidErrorCode(err);
    const status = code && LOGIN_REQUIRED_CODES.has(code) ? "login_required" : "error";
    await db.update(s.plaidItems).set({ status, errorCode: code ?? "SYNC_FAILED" }).where(eq(s.plaidItems.id, itemId));
    const message = plaidErrorMessage(err);
    console.error(`[sync] ${item.institutionName ?? itemId}: ${message}`);
    return { ...base, added: 0, modified: 0, removed: 0, status, error: message };
  }

  const { added, modified, removed, accounts, nextCursor, updateStatus } = updates;

  if (accounts.length) await upsertAccounts(itemId, accounts);

  // Map Plaid account ids to our ids.
  const plaidAccountIds = [...new Set([...added, ...modified].map((t) => t.account_id))];
  const accountRows = plaidAccountIds.length
    ? await db
        .select({ id: s.accounts.id, plaidAccountId: s.accounts.plaidAccountId })
        .from(s.accounts)
        .where(inArray(s.accounts.plaidAccountId, plaidAccountIds))
    : [];
  const accountIdMap = new Map(accountRows.map((r) => [r.plaidAccountId, r.id]));

  // When a pending charge posts, Plaid removes the pending one and adds a new
  // posted one. Carry over a category or note someone set on the pending one.
  const pendingIds = added.map((t) => t.pending_transaction_id).filter((x): x is string => !!x);
  const pendingRows = pendingIds.length
    ? await db
        .select({
          plaidTransactionId: s.transactions.plaidTransactionId,
          categoryId: s.transactions.categoryId,
          categoryOverridden: s.transactions.categoryOverridden,
          notes: s.transactions.notes,
        })
        .from(s.transactions)
        .where(inArray(s.transactions.plaidTransactionId, pendingIds))
    : [];
  const pendingMap = new Map(pendingRows.map((r) => [r.plaidTransactionId, r]));

  const resolve = await createCategoryResolver();
  const rows: (typeof s.transactions.$inferInsert)[] = [];
  for (const t of [...added, ...modified]) {
    const accountId = accountIdMap.get(t.account_id);
    if (!accountId) continue;
    const fields = {
      merchantName: t.merchant_name ?? null,
      name: t.name,
      pfcPrimary: t.personal_finance_category?.primary ?? null,
      pfcDetailed: t.personal_finance_category?.detailed ?? null,
    };
    const carried = t.pending_transaction_id ? pendingMap.get(t.pending_transaction_id) : undefined;
    const overridden = carried?.categoryOverridden ?? false;
    rows.push({
      plaidTransactionId: t.transaction_id,
      accountId,
      amount: t.amount.toFixed(2),
      isoCurrencyCode: t.iso_currency_code,
      date: t.date,
      authorizedDate: t.authorized_date,
      logoUrl: t.logo_url ?? null,
      pending: t.pending,
      ...fields,
      categoryId: overridden ? carried!.categoryId : await resolve(fields),
      categoryOverridden: overridden,
      notes: carried?.notes ?? null,
    });
  }

  await db.transaction(async (tx) => {
    for (const part of chunk(rows, 250)) {
      await tx
        .insert(s.transactions)
        .values(part)
        .onConflictDoUpdate({
          target: s.transactions.plaidTransactionId,
          set: {
            amount: sql`excluded.amount`,
            date: sql`excluded.date`,
            authorizedDate: sql`excluded.authorized_date`,
            name: sql`excluded.name`,
            merchantName: sql`excluded.merchant_name`,
            logoUrl: sql`excluded.logo_url`,
            pfcPrimary: sql`excluded.pfc_primary`,
            pfcDetailed: sql`excluded.pfc_detailed`,
            pending: sql`excluded.pending`,
            // Never overwrite a category someone picked by hand.
            categoryId: sql`case when ${s.transactions.categoryOverridden} then ${s.transactions.categoryId} else excluded.category_id end`,
            updatedAt: sql`now()`,
          },
        });
    }
    const removedIds = removed.map((r) => r.transaction_id);
    for (const part of chunk(removedIds, 500)) {
      await tx.delete(s.transactions).where(inArray(s.transactions.plaidTransactionId, part));
    }
    await tx
      .update(s.plaidItems)
      .set({ cursor: nextCursor, lastSyncedAt: new Date(), status: "good", errorCode: null })
      .where(eq(s.plaidItems.id, itemId));
  });

  return {
    ...base,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    status: "good",
    updateStatus,
  };
}

export async function syncAllItems(): Promise<SyncResult[]> {
  // Only connections from the Plaid environment the app is running in.
  const items = await db
    .select({ id: s.plaidItems.id })
    .from(s.plaidItems)
    .where(eq(s.plaidItems.plaidEnv, plaidEnv()));
  const results: SyncResult[] = [];
  for (const item of items) {
    try {
      results.push(await syncItem(item.id));
    } catch (err) {
      results.push({
        itemId: item.id,
        institution: null,
        added: 0,
        modified: 0,
        removed: 0,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
