import Link from "next/link";
import { monthLabel, shiftMonth, monthKey } from "@/lib/format";

export function MonthPicker({ month, basePath, extra }: { month: string; basePath: string; extra?: Record<string, string | undefined> }) {
  const href = (m: string) => {
    const params = new URLSearchParams();
    params.set("month", m);
    for (const [k, v] of Object.entries(extra ?? {})) if (v) params.set(k, v);
    return `${basePath}?${params}`;
  };
  const isCurrent = month === monthKey();
  return (
    <div className="flex items-center gap-2">
      <Link className="btn-ghost" href={href(shiftMonth(month, -1))} aria-label="Previous month">←</Link>
      <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
      {isCurrent ? (
        <span className="btn-ghost pointer-events-none opacity-30">→</span>
      ) : (
        <Link className="btn-ghost" href={href(shiftMonth(month, 1))} aria-label="Next month">→</Link>
      )}
    </div>
  );
}
