import Link from "next/link";
import { budgetSuggestions, allCategories } from "@/lib/queries";
import { money } from "@/lib/format";
import { saveBudgets, applySuggestions, updateCategory, mergeCategory, createCategory } from "@/app/actions/budget";

const WINDOWS = [3, 6, 12] as const;

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const sp = await searchParams;
  const w = Number(sp.window);
  const window = (WINDOWS as readonly number[]).includes(w) ? (w as 3 | 6 | 12) : 6;

  const [suggestions, cats] = await Promise.all([budgetSuggestions(window), allCategories()]);
  const monthsOfData = suggestions[0]?.monthsOfData ?? window;
  const totalBudget = suggestions.reduce((a, x) => a + (x.current ?? 0), 0);
  const totalSuggested = suggestions.reduce((a, x) => a + x.suggested, 0);
  const totalAverage = suggestions.reduce((a, x) => a + x.average, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Budgets</h1>
        <p className="mt-1 text-sm text-muted">
          Each category gets one monthly budget that repeats every month. Suggestions are your average monthly spending
          over the last {monthsOfData} complete month{monthsOfData === 1 ? "" : "s"}
          {monthsOfData < window ? ` (that's all the history there is so far)` : ""}, rounded up.
        </p>
      </div>

      <section className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="mr-1 text-muted">Average over</span>
            {WINDOWS.map((n) => (
              <Link
                key={n}
                href={`/budgets?window=${n}`}
                className={`rounded-md px-2 py-1 ${n === window ? "bg-track font-medium" : "text-muted hover:text-foreground"}`}
              >
                {n} mo
              </Link>
            ))}
          </div>
          <form action={applySuggestions} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="window" value={window} />
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" name="onlyEmpty" defaultChecked={totalBudget > 0} /> Only categories without a budget
            </label>
            <button className="btn-ghost">Use suggestions</button>
          </form>
        </div>

        <form action={saveBudgets}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2">Category</th>
                <th className="px-3 py-2 text-right">Avg / month</th>
                <th className="px-3 py-2 text-right">Suggested</th>
                <th className="px-5 py-2 text-right">Monthly budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {suggestions.map((x) => (
                <tr key={x.categoryId}>
                  <td className="px-5 py-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-2.5 rounded-full" style={{ background: x.color }} />
                      {x.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{money(x.average, { whole: true })}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{x.suggested ? money(x.suggested, { whole: true }) : "—"}</td>
                  <td className="px-5 py-2 text-right">
                    <div className="ml-auto flex max-w-36 items-center gap-1">
                      <span className="text-muted">$</span>
                      <input
                        className="input py-1 text-right tabular-nums"
                        name={`budget:${x.categoryId}`}
                        inputMode="decimal"
                        defaultValue={x.current !== null ? String(x.current) : ""}
                        placeholder={x.suggested ? String(x.suggested) : "0"}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted">
                    No categories yet. They appear once transactions are imported from your accounts.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-border font-medium">
              <tr>
                <td className="px-5 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(totalAverage, { whole: true })}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(totalSuggested, { whole: true })}</td>
                <td className="px-5 py-3 text-right tabular-nums">{money(totalBudget, { whole: true })}</td>
              </tr>
            </tfoot>
          </table>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <button className="btn">Save budgets</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Categories</h2>
        <p className="mb-3 text-sm text-muted">
          Categories were created from the Plaid categories in your history. Rename them, merge ones you don&apos;t need
          apart, or mark one as &ldquo;not spending&rdquo; (like transfers and card payments) to leave it out of totals.
        </p>
        <div className="card divide-y divide-border p-0">
          {cats.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <form action={updateCategory} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="color" name="color" defaultValue={c.color} className="size-8 cursor-pointer rounded border border-border bg-transparent" />
                <input className="input max-w-56 py-1" name="name" defaultValue={c.name} />
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" name="excludeFromSpending" defaultChecked={c.excludeFromSpending} /> Not spending
                </label>
                <button className="btn-ghost">Save</button>
              </form>
              <form action={mergeCategory} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <select name="intoId" className="input max-w-44 py-1" defaultValue="">
                  <option value="" disabled>Merge into…</option>
                  {cats.filter((o) => o.id !== c.id).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <button className="btn-ghost">Merge</button>
              </form>
            </div>
          ))}
          <form action={createCategory} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
            <input type="color" name="color" defaultValue="#64748b" className="size-8 cursor-pointer rounded border border-border bg-transparent" />
            <input className="input max-w-56 py-1" name="name" placeholder="New category name" required />
            <button className="btn-ghost">Add category</button>
          </form>
        </div>
      </section>
    </div>
  );
}
