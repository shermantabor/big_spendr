"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, s } from "@/db";
import { requireUser } from "@/lib/session";
import { merchantKey } from "@/lib/categories";
import { syncAllItems, syncItem } from "@/lib/sync";
import { decrypt } from "@/lib/crypto";
import { plaid, plaidEnv, plaidErrorMessage } from "@/lib/plaid";
import { budgetSuggestions } from "@/lib/queries";

function refresh() {
  revalidatePath("/", "layout");
}

function parseAmount(v: FormDataEntryValue | null): number | null {
  const str = String(v ?? "").replace(/[$,\s]/g, "");
  if (str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Saves the whole budget form: one input per category named budget:<id>. */
export async function saveBudgets(form: FormData) {
  await requireUser();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("budget:")) continue;
    const categoryId = key.slice("budget:".length);
    const amount = parseAmount(value);
    if (amount === null || amount === 0) {
      await db.delete(s.budgets).where(eq(s.budgets.categoryId, categoryId));
    } else {
      await db
        .insert(s.budgets)
        .values({ categoryId, monthlyAmount: amount.toFixed(2) })
        .onConflictDoUpdate({
          target: s.budgets.categoryId,
          set: { monthlyAmount: amount.toFixed(2), updatedAt: new Date() },
        });
    }
  }
  refresh();
}

export async function setTransactionCategory(form: FormData) {
  await requireUser();
  const transactionId = String(form.get("transactionId"));
  const raw = String(form.get("categoryId") ?? "");
  const categoryId = raw === "" ? null : raw;
  const applyToMerchant = form.get("applyToMerchant") === "on";

  const [t] = await db.select().from(s.transactions).where(eq(s.transactions.id, transactionId));
  if (!t) return;

  if (applyToMerchant && categoryId) {
    const key = merchantKey(t);
    await db
      .insert(s.categoryRules)
      .values({ merchantKey: key, categoryId })
      .onConflictDoUpdate({ target: s.categoryRules.merchantKey, set: { categoryId } });
    // Apply to every past transaction from this merchant that wasn't hand-picked.
    // (Same key as merchantKey(): merchant name, else transaction name, lower-cased.)
    await db
      .update(s.transactions)
      .set({ categoryId })
      .where(
        and(
          eq(s.transactions.categoryOverridden, false),
          sql`lower(trim(coalesce(nullif(${s.transactions.merchantName}, ''), ${s.transactions.name}))) = ${key}`,
        ),
      );
  }

  await db
    .update(s.transactions)
    .set({ categoryId, categoryOverridden: true, updatedAt: new Date() })
    .where(eq(s.transactions.id, transactionId));
  refresh();
}

export async function setTransactionNote(form: FormData) {
  await requireUser();
  const transactionId = String(form.get("transactionId"));
  const notes = String(form.get("notes") ?? "").trim() || null;
  await db.update(s.transactions).set({ notes }).where(eq(s.transactions.id, transactionId));
  refresh();
}

export async function createCategory(form: FormData) {
  await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const color = String(form.get("color") ?? "#64748b");
  await db.insert(s.categories).values({ name, color }).onConflictDoNothing();
  refresh();
}

export async function updateCategory(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("color") ?? "");
  const excludeFromSpending = form.get("excludeFromSpending") === "on";
  await db
    .update(s.categories)
    .set({ ...(name ? { name } : {}), ...(color ? { color } : {}), excludeFromSpending })
    .where(eq(s.categories.id, id));
  refresh();
}

/** Moves every transaction, rule and budget from one category into another, then deletes it. */
export async function mergeCategory(form: FormData) {
  await requireUser();
  const fromId = String(form.get("id"));
  const intoId = String(form.get("intoId") ?? "");
  if (!intoId || intoId === fromId) return;
  await db.transaction(async (tx) => {
    await tx.update(s.transactions).set({ categoryId: intoId }).where(eq(s.transactions.categoryId, fromId));
    await tx.update(s.categoryRules).set({ categoryId: intoId }).where(eq(s.categoryRules.categoryId, fromId));
    // Future transactions from the merged category's Plaid categories go to the new one.
    await tx.update(s.plaidCategoryMap).set({ categoryId: intoId }).where(eq(s.plaidCategoryMap.categoryId, fromId));
    // Add the two budgets together rather than silently dropping one.
    const [fromBudget] = await tx.select().from(s.budgets).where(eq(s.budgets.categoryId, fromId));
    if (fromBudget) {
      const [intoBudget] = await tx.select().from(s.budgets).where(eq(s.budgets.categoryId, intoId));
      const sum = (parseFloat(fromBudget.monthlyAmount) + parseFloat(intoBudget?.monthlyAmount ?? "0")).toFixed(2);
      await tx
        .insert(s.budgets)
        .values({ categoryId: intoId, monthlyAmount: sum })
        .onConflictDoUpdate({ target: s.budgets.categoryId, set: { monthlyAmount: sum, updatedAt: new Date() } });
    }
    await tx.delete(s.categories).where(eq(s.categories.id, fromId));
  });
  refresh();
}

export async function setAccountHidden(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const hidden = form.get("hidden") === "true";
  await db.update(s.accounts).set({ hidden }).where(eq(s.accounts.id, id));
  refresh();
}

export async function syncNow(form: FormData) {
  await requireUser();
  const itemId = form.get("itemId");
  if (itemId) await syncItem(String(itemId));
  else await syncAllItems();
  refresh();
}

export async function removeItem(form: FormData) {
  await requireUser();
  const id = String(form.get("itemId"));
  const [item] = await db.select().from(s.plaidItems).where(eq(s.plaidItems.id, id));
  if (!item) return;
  // Tell Plaid first so it stops billing for the connection. A token from the
  // other environment (e.g. sandbox, after switching to production) can't be
  // used here, and sandbox connections cost nothing, so just delete those.
  if (item.plaidEnv === plaidEnv()) {
    try {
      await plaid().item.remove({ access_token: decrypt(item.accessTokenEnc) });
    } catch (err) {
      // Still remove it locally; log so it can be cleaned up in the Plaid dashboard.
      console.error("[removeItem]", plaidErrorMessage(err));
    }
  }
  await db.delete(s.plaidItems).where(eq(s.plaidItems.id, id));
  refresh();
}

/**
 * After switching Plaid environments: deletes every connection from the other
 * environment along with its accounts and transactions. With resetCategories,
 * also deletes categories that no longer have any transactions (and their
 * budgets), so fake sandbox spending doesn't shape your real categories and
 * budget suggestions. Categories with real transactions are kept.
 */
export async function clearOtherEnvironment(form: FormData) {
  await requireUser();
  const resetCategories = form.get("resetCategories") === "on";
  await db.transaction(async (tx) => {
    await tx.delete(s.plaidItems).where(ne(s.plaidItems.plaidEnv, plaidEnv()));
    if (resetCategories) {
      await tx
        .delete(s.categories)
        .where(sql`not exists (select 1 from ${s.transactions} where ${s.transactions.categoryId} = ${s.categories.id})`);
    }
  });
  refresh();
}

/** Sets every category's budget to its suggested amount from spending history. */
export async function applySuggestions(form: FormData) {
  await requireUser();
  const w = Number(form.get("window"));
  const window = (w === 3 || w === 12 ? w : 6) as 3 | 6 | 12;
  const onlyEmpty = form.get("onlyEmpty") === "on";
  const suggestions = await budgetSuggestions(window);
  for (const sug of suggestions) {
    if (sug.suggested <= 0) continue;
    if (onlyEmpty && sug.current !== null) continue;
    await db
      .insert(s.budgets)
      .values({ categoryId: sug.categoryId, monthlyAmount: sug.suggested.toFixed(2) })
      .onConflictDoUpdate({
        target: s.budgets.categoryId,
        set: { monthlyAmount: sug.suggested.toFixed(2), updatedAt: new Date() },
      });
  }
  refresh();
}
