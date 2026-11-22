const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function money(n: number | string | null | undefined, opts?: { whole?: boolean }) {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return (opts?.whole ? usd0 : usd).format(v);
}

/** "2026-11" for a Date, in the app's time zone. */
export function monthKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

export function tz() {
  return process.env.APP_TIMEZONE || "America/New_York";
}

/** Today's date in the app's time zone, as YYYY-MM-DD. */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz() }).format(new Date());
}

export function parseMonth(m: string | undefined | null): string {
  return m && /^\d{4}-\d{2}$/.test(m) ? m : monthKey();
}

/** First day of the month, and first day of the next month, as YYYY-MM-DD. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = `${ny}-${String(nm).padStart(2, "0")}-01`;
  return { start, end };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dateLabel(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Plaid amounts are positive for money out. Show purchases plainly and refunds/credits with a "+". */
export function txnAmount(amount: string | number) {
  const v = typeof amount === "string" ? parseFloat(amount) : amount;
  return v < 0 ? { text: `+${money(-v)}`, credit: true } : { text: money(v), credit: false };
}
