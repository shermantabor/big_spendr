import Link from "next/link";
import { sql } from "drizzle-orm";
import { db, s } from "@/db";
import { spendingByCategory, monthlyTotals, listTransactions } from "@/lib/queries";
import { money, monthKey, monthLabel, parseMonth, today, dateLabel, txnAmount } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import { BudgetBar } from "@/components/progress";

export default async function Overview({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const month = parseMonth(typeof sp.month === "string" ? sp.month : undefined);

  const [[{ items }], cats, trend, recent] = await Promise.all([
    db.select({ items: sql<number>`count(*)::int` }).from(s.plaidItems),
    spendingByCategory(month),
    monthlyTotals(6, month),
    listTransactions({ month }, 8),
  ]);

  if (items === 0) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <h2 className="text-lg font-semibold">Welcome! Let&apos;s connect your accounts.</h2>
        <p className="mt-2 text-sm text-muted">
          Link your credit cards and bank accounts through Plaid. We&apos;ll import up to two years of history, build
          your spending categories from it, and suggest a budget for each.
        </p>
        <Link href="/accounts" className="btn mt-4">Connect an account</Link>
      </div>
    );
  }

  const totalSpent = cats.reduce((a, c) => a + c.spent, 0);
  const totalBudget = cats.reduce((a, c) => a + (c.budget ?? 0), 0);
  const hasBudgets = totalBudget > 0;

  // How far through the month we are, for the "on pace" marker.
  let expectedPct: number | undefined;
  if (month === monthKey()) {
    const [y, m, d] = today().split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    expectedPct = (d / days) * 100;
  }
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Overview</h1>
        <MonthPicker month={month} basePath="/" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-sm text-muted">Spent in {monthLabel(month, "short")}</div>
          <div className="mt-1 text-2xl font-semibold">{money(totalSpent)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Monthly budget</div>
          <div className="mt-1 text-2xl font-semibold">{hasBudgets ? money(totalBudget, { whole: true }) : "—"}</div>
          {!hasBudgets && <Link href="/budgets" className="text-sm text-accent underline">Set up budgets</Link>}
        </div>
        <div className="card">
          <div className="text-sm text-muted">{totalSpent > totalBudget ? "Over budget" : "Left to spend"}</div>
          <div className={`mt-1 text-2xl font-semibold ${hasBudgets && totalSpent > totalBudget ? "text-danger" : ""}`}>
            {hasBudgets ? money(Math.abs(totalBudget - totalSpent)) : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="mb-4 font-semibold">By category</h2>
          {cats.length === 0 ? (
            <p className="text-sm text-muted">No spending this month yet.</p>
          ) : (
            <ul className="space-y-4">
              {cats.map((c) => (
                <li key={c.categoryId ?? "none"}>
                  <Link
                    href={`/transactions?month=${month}&category=${c.categoryId ?? "none"}`}
                    className="mb-1.5 flex items-baseline justify-between gap-2 text-sm hover:underline"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-2.5 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="tabular-nums">
                      {money(c.spent, { whole: true })}
                      {c.budget !== null && <span className="text-muted"> / {money(c.budget, { whole: true })}</span>}
                    </span>
                  </Link>
                  <BudgetBar spent={c.spent} budget={c.budget} color={c.color} expectedPct={expectedPct} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-4 font-semibold">Last 6 months</h2>
            <div className="flex h-36 items-end gap-2">
              {trend.map((t) => (
                <Link key={t.month} href={`/?month=${t.month}`} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted opacity-0 group-hover:opacity-100">
                    {money(t.total, { whole: true })}
                  </span>
                  <div
                    className={`w-full rounded-t ${t.month === month ? "bg-accent" : "bg-track group-hover:bg-muted/40"}`}
                    style={{ height: `${Math.max(2, (t.total / maxTrend) * 100)}px` }}
                  />
                  <span className="text-xs text-muted">{monthLabel(t.month, "short").split(" ")[0]}</span>
                </Link>
              ))}
            </div>
            {hasBudgets && <p className="mt-3 text-xs text-muted">Budget: {money(totalBudget, { whole: true })} a month</p>}
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Recent</h2>
              <Link href={`/transactions?month=${month}`} className="text-sm text-accent">See all</Link>
            </div>
            <ul className="divide-y divide-border text-sm">
              {recent.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate">
                    <span className="text-muted">{dateLabel(t.date)}</span> {t.merchantName || t.name}
                    {t.pending && <span className="ml-1 text-xs text-muted">(pending)</span>}
                  </span>
                  <span className={`tabular-nums ${txnAmount(t.amount).credit ? "text-green-600 dark:text-green-400" : ""}`}>
                    {txnAmount(t.amount).text}
                  </span>
                </li>
              ))}
              {recent.length === 0 && <li className="py-2 text-muted">Nothing yet this month.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
