import "server-only";
import { eq } from "drizzle-orm";
import { db, s } from "@/db";

type Default = { name: string; color: string; exclude?: boolean };

// Plaid "personal finance category" primary values → starting categories.
// https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv
const PRIMARY: Record<string, Default> = {
  FOOD_AND_DRINK: { name: "Restaurants & Coffee", color: "#f97316" },
  GENERAL_MERCHANDISE: { name: "Shopping", color: "#8b5cf6" },
  TRANSPORTATION: { name: "Transportation", color: "#0ea5e9" },
  TRAVEL: { name: "Travel", color: "#06b6d4" },
  ENTERTAINMENT: { name: "Entertainment", color: "#ec4899" },
  RENT_AND_UTILITIES: { name: "Housing & Utilities", color: "#14b8a6" },
  HOME_IMPROVEMENT: { name: "Home", color: "#84cc16" },
  MEDICAL: { name: "Medical", color: "#ef4444" },
  PERSONAL_CARE: { name: "Personal Care", color: "#d946ef" },
  GENERAL_SERVICES: { name: "Services", color: "#6366f1" },
  GOVERNMENT_AND_NON_PROFIT: { name: "Taxes & Donations", color: "#a3a3a3" },
  BANK_FEES: { name: "Fees", color: "#78716c" },
  LOAN_PAYMENTS: { name: "Loan Payments", color: "#64748b" },
  LOAN_DISBURSEMENTS: { name: "Loan Disbursements", color: "#94a3b8", exclude: true },
  INCOME: { name: "Income", color: "#22c55e", exclude: true },
  TRANSFER_IN: { name: "Transfers In", color: "#94a3b8", exclude: true },
  TRANSFER_OUT: { name: "Transfers Out", color: "#94a3b8", exclude: true },
};

// A few detailed categories are split out because families usually budget
// them separately from their parent.
const DETAILED: Record<string, Default> = {
  FOOD_AND_DRINK_GROCERIES: { name: "Groceries", color: "#16a34a" },
  TRANSPORTATION_GAS: { name: "Gas", color: "#0284c7" },
  // Paying off a credit card isn't spending: the card's own charges already are.
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: { name: "Credit Card Payments", color: "#94a3b8", exclude: true },
};

function titleCase(key: string) {
  return key
    .toLowerCase()
    .split("_")
    .map((w) => (w === "and" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The Plaid key a transaction maps to, and the defaults for a new category. */
export function plaidKeyFor(primary: string | null | undefined, detailed: string | null | undefined) {
  if (detailed && DETAILED[detailed]) return { key: detailed, def: DETAILED[detailed] };
  if (primary) return { key: primary, def: PRIMARY[primary] ?? { name: titleCase(primary), color: "#64748b" } };
  return null;
}

export function merchantKey(t: { merchantName?: string | null; name: string }) {
  return (t.merchantName || t.name).trim().toLowerCase();
}

/**
 * Resolves categories during a sync. Loads rules and categories once, and
 * creates a category the first time a new Plaid category shows up in your
 * history. That's how the category list ends up matching your real spending.
 */
export async function createCategoryResolver() {
  const [rules, cats, maps] = await Promise.all([
    db.select().from(s.categoryRules),
    db.select().from(s.categories),
    db.select().from(s.plaidCategoryMap),
  ]);
  const ruleMap = new Map(rules.map((r) => [r.merchantKey, r.categoryId]));
  const byKey = new Map(maps.map((m) => [m.plaidKey, m.categoryId]));
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  return async function resolve(t: {
    merchantName: string | null;
    name: string;
    pfcPrimary: string | null;
    pfcDetailed: string | null;
  }): Promise<string | null> {
    const ruled = ruleMap.get(merchantKey(t));
    if (ruled) return ruled;

    const mapped = plaidKeyFor(t.pfcPrimary, t.pfcDetailed);
    if (!mapped) return null;
    const existing = byKey.get(mapped.key);
    if (existing) return existing;

    // First time we've seen this Plaid category. Reuse a category with the
    // default name if one exists (say someone made "Groceries" by hand),
    // otherwise create it.
    let id = byName.get(mapped.def.name.toLowerCase());
    if (!id) {
      const [created] = await db
        .insert(s.categories)
        .values({ name: mapped.def.name, color: mapped.def.color, excludeFromSpending: mapped.def.exclude ?? false })
        .onConflictDoNothing()
        .returning({ id: s.categories.id });
      id = created?.id;
      if (!id) {
        const [row] = await db.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.name, mapped.def.name));
        id = row?.id;
      }
    }
    if (!id) return null;

    await db.insert(s.plaidCategoryMap).values({ plaidKey: mapped.key, categoryId: id }).onConflictDoNothing();
    byKey.set(mapped.key, id);
    byName.set(mapped.def.name.toLowerCase(), id);
    return id;
  };
}
