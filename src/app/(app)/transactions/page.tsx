import { asc } from "drizzle-orm";
import { db, s } from "@/db";
import { allCategories, listTransactions } from "@/lib/queries";
import { dateLabel, parseMonth, txnAmount, money } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import { CategoryCell } from "@/components/category-cell";
import { NoteCell } from "@/components/note-cell";

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const month = parseMonth(str("month"));
  const category = str("category");
  const account = str("account");
  const q = str("q");

  const [txns, cats, accts] = await Promise.all([
    listTransactions({ month, categoryId: category, accountId: account, q }),
    allCategories(),
    db.select({ id: s.accounts.id, name: s.accounts.name, mask: s.accounts.mask }).from(s.accounts).orderBy(asc(s.accounts.name)),
  ]);

  const spending = txns.filter((t) => !t.excluded).reduce((a, t) => a + parseFloat(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <MonthPicker month={month} basePath="/transactions" extra={{ category, account, q }} />
      </div>

      <form className="flex flex-wrap gap-2" action="/transactions">
        <input type="hidden" name="month" value={month} />
        <input className="input max-w-56" name="q" placeholder="Search merchant" defaultValue={q} />
        <select className="input max-w-52" name="category" defaultValue={category ?? ""}>
          <option value="">All categories</option>
          <option value="none">Uncategorized</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input max-w-52" name="account" defaultValue={account ?? ""}>
          <option value="">All accounts</option>
          {accts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}{a.mask ? ` ••${a.mask}` : ""}</option>
          ))}
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

      <p className="text-sm text-muted">
        {txns.length} transactions · {money(spending)} counted as spending
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Merchant</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {txns.map((t) => {
              const amt = txnAmount(t.amount);
              const merchant = t.merchantName || t.name;
              return (
                <tr key={t.id} className={t.excluded ? "opacity-60" : ""}>
                  <td className="whitespace-nowrap px-4 py-2 align-top text-muted">{dateLabel(t.date)}</td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex items-center gap-2">
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoUrl} alt="" className="size-6 rounded" />
                      ) : (
                        <span className="inline-block size-6 rounded bg-track" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {merchant}
                          {t.pending && <span className="ml-1.5 rounded bg-track px-1.5 py-0.5 text-[10px] text-muted">pending</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {t.accountName}{t.accountMask ? ` ••${t.accountMask}` : ""}
                        </div>
                        <NoteCell transactionId={t.id} notes={t.notes} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <CategoryCell
                      key={`${t.id}:${t.categoryId}`}
                      transactionId={t.id}
                      merchant={merchant}
                      categoryId={t.categoryId}
                      categories={cats.map((c) => ({ id: c.id, name: c.name }))}
                    />
                  </td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right align-top tabular-nums ${amt.credit ? "text-green-600 dark:text-green-400" : ""}`}>
                    {amt.text}
                  </td>
                </tr>
              );
            })}
            {txns.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No transactions match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
