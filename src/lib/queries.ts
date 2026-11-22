import "server-only";
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db, s } from "@/db";
import { monthRange, shiftMonth, monthKey } from "@/lib/format";

/** Transactions that count as spending: visible accounts, non-excluded categories. */
const countsAsSpending = and(
  eq(s.accounts.hidden, false),
  sql`coalesce(${s.categories.excludeFromSpending}, false) = false`,
)!;

export type CategorySpend = {
  categoryId: string | null;
  name: string;
  color: string;
  spent: number;
  budget: number | null;
};

/** Spending per category for one month, with each category's budget. */
export async function spendingByCategory(month: string): Promise<CategorySpend[]> {
  const { start, end } = monthRange(month);
  const spent = await db
    .select({
      categoryId: s.transactions.categoryId,
      total: sql<string>`sum(${s.transactions.amount})`,
    })
    .from(s.transactions)
    .innerJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
    .leftJoin(s.categories, eq(s.transactions.categoryId, s.categories.id))
    .where(and(gte(s.transactions.date, start), lt(s.transactions.date, end), countsAsSpending))
    .groupBy(s.transactions.categoryId);

  const cats = await db
    .select({
      id: s.categories.id,
      name: s.categories.name,
      color: s.categories.color,
      budget: s.budgets.monthlyAmount,
    })
    .from(s.categories)
    .leftJoin(s.budgets, eq(s.budgets.categoryId, s.categories.id))
    .where(eq(s.categories.excludeFromSpending, false))
    .orderBy(asc(s.categories.sortOrder), asc(s.categories.name));

  const spentMap = new Map(spent.map((r) => [r.categoryId, parseFloat(r.total)]));
  const rows: CategorySpend[] = cats
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      spent: spentMap.get(c.id) ?? 0,
      budget: c.budget !== null ? parseFloat(c.budget) : null,
    }))
    .filter((r) => r.spent !== 0 || r.budget !== null);

  const uncategorized = spentMap.get(null);
  if (uncategorized) {
    rows.push({ categoryId: null, name: "Uncategorized", color: "#cbd5e1", spent: uncategorized, budget: null });
  }
  return rows.sort((a, b) => (b.budget ?? b.spent) - (a.budget ?? a.spent));
}

/** Total spending per month for the last `months` months, oldest first. */
export async function monthlyTotals(months: number, endMonth = monthKey()) {
  const startMonth = shiftMonth(endMonth, -(months - 1));
  const { start } = monthRange(startMonth);
  const { end } = monthRange(endMonth);
  const rows = await db
    .select({
      month: sql<string>`to_char(${s.transactions.date}, 'YYYY-MM')`,
      total: sql<string>`sum(${s.transactions.amount})`,
    })
    .from(s.transactions)
    .innerJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
    .leftJoin(s.categories, eq(s.transactions.categoryId, s.categories.id))
    .where(and(gte(s.transactions.date, start), lt(s.transactions.date, end), countsAsSpending))
    .groupBy(sql`1`);
  const map = new Map(rows.map((r) => [r.month, parseFloat(r.total)]));
  return Array.from({ length: months }, (_, i) => {
    const m = shiftMonth(startMonth, i);
    return { month: m, total: map.get(m) ?? 0 };
  });
}

export type BudgetSuggestion = {
  categoryId: string;
  name: string;
  color: string;
  current: number | null;
  average: number;
  suggested: number;
  monthsOfData: number;
};

function roundUp(n: number) {
  if (n <= 0) return 0;
  const step = n < 100 ? 5 : n < 500 ? 10 : 25;
  return Math.ceil(n / step) * step;
}

/**
 * Suggested monthly budgets from history: the average monthly spend per
 * category over the last `months` complete months (the current, partial month
 * is left out), rounded up. If you have less history than that, it averages
 * over the months you do have.
 */
export async function budgetSuggestions(months: 3 | 6 | 12): Promise<BudgetSuggestion[]> {
  const thisMonth = monthKey();
  const idx = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return y * 12 + (mo - 1);
  };
  const fromIdx = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const thisIdx = idx(thisMonth);
  let windowStart = thisIdx - months;

  // Don't average in months from before your history starts, and skip the
  // first month if it only has a few days of data.
  const [earliest] = await db
    .select({ d: sql<string | null>`min(${s.transactions.date})::text` })
    .from(s.transactions);
  if (earliest?.d) {
    const day = Number(earliest.d.slice(8, 10));
    const firstFull = idx(earliest.d.slice(0, 7)) + (day > 3 ? 1 : 0);
    windowStart = Math.max(windowStart, firstFull);
  }
  let windowEnd = thisIdx;
  if (windowStart >= windowEnd) {
    // Less than one complete month of history: use what there is.
    windowStart = earliest?.d ? idx(earliest.d.slice(0, 7)) : thisIdx;
    windowEnd = thisIdx + 1;
  }
  const monthsOfData = Math.max(1, Math.min(months, windowEnd - windowStart));
  const { start } = monthRange(fromIdx(windowStart));
  const { start: end } = monthRange(fromIdx(windowEnd));

  const rows = await db
    .select({
      categoryId: s.categories.id,
      name: s.categories.name,
      color: s.categories.color,
      current: s.budgets.monthlyAmount,
      total: sql<string>`coalesce(sum(${s.transactions.amount}) filter (where ${s.transactions.date} >= ${start} and ${s.transactions.date} < ${end} and ${s.accounts.hidden} = false), 0)`,
    })
    .from(s.categories)
    .leftJoin(s.transactions, eq(s.transactions.categoryId, s.categories.id))
    .leftJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
    .leftJoin(s.budgets, eq(s.budgets.categoryId, s.categories.id))
    .where(eq(s.categories.excludeFromSpending, false))
    .groupBy(s.categories.id, s.budgets.monthlyAmount);

  return rows
    .map((r) => {
      const average = Math.max(0, parseFloat(r.total) / monthsOfData);
      return {
        categoryId: r.categoryId,
        name: r.name,
        color: r.color,
        current: r.current !== null ? parseFloat(r.current) : null,
        average,
        suggested: roundUp(average),
        monthsOfData,
      };
    })
    .sort((a, b) => b.average - a.average);
}

export type TxnFilter = { month: string; categoryId?: string; accountId?: string; q?: string };

export async function listTransactions(f: TxnFilter, limit = 500) {
  const { start, end } = monthRange(f.month);
  const conds: SQL[] = [gte(s.transactions.date, start), lt(s.transactions.date, end)];
  if (f.categoryId === "none") conds.push(sql`${s.transactions.categoryId} is null`);
  else if (f.categoryId) conds.push(eq(s.transactions.categoryId, f.categoryId));
  if (f.accountId) conds.push(eq(s.transactions.accountId, f.accountId));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(sql`(${s.transactions.name} ilike ${like} or ${s.transactions.merchantName} ilike ${like})`);
  }
  return db
    .select({
      id: s.transactions.id,
      date: s.transactions.date,
      name: s.transactions.name,
      merchantName: s.transactions.merchantName,
      amount: s.transactions.amount,
      pending: s.transactions.pending,
      logoUrl: s.transactions.logoUrl,
      categoryId: s.transactions.categoryId,
      categoryOverridden: s.transactions.categoryOverridden,
      notes: s.transactions.notes,
      accountName: s.accounts.name,
      accountMask: s.accounts.mask,
      excluded: sql<boolean>`coalesce(${s.categories.excludeFromSpending}, false) or ${s.accounts.hidden}`,
    })
    .from(s.transactions)
    .innerJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
    .leftJoin(s.categories, eq(s.transactions.categoryId, s.categories.id))
    .where(and(...conds))
    .orderBy(desc(s.transactions.date), desc(s.transactions.createdAt))
    .limit(limit);
}

export async function allCategories() {
  return db.select().from(s.categories).orderBy(asc(s.categories.sortOrder), asc(s.categories.name));
}
