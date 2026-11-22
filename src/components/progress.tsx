import { money } from "@/lib/format";

/** A budget bar: fills with the category color, turns amber near the limit and red over it. */
export function BudgetBar({ spent, budget, color, expectedPct }: { spent: number; budget: number | null; color: string; expectedPct?: number }) {
  if (!budget) {
    return <div className="h-2 rounded-full bg-track" />;
  }
  const pct = Math.max(0, (spent / budget) * 100);
  const over = pct > 100;
  const near = !over && expectedPct !== undefined && pct > expectedPct + 10;
  const fill = over ? "var(--danger)" : near ? "var(--warn)" : color;
  return (
    <div className="relative h-2 rounded-full bg-track" title={`${money(spent)} of ${money(budget)}`}>
      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: fill }} />
      {expectedPct !== undefined && expectedPct < 100 && (
        <div className="absolute -top-1 h-4 w-px bg-foreground/40" style={{ left: `${expectedPct}%` }} title="Where you'd be if spending evenly through the month" />
      )}
    </div>
  );
}
