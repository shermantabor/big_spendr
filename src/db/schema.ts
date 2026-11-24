import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  numeric,
  date,
  integer,
  index,
} from "drizzle-orm/pg-core";

// This app is built for one household. Everyone who can sign in shares all data.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plaidItems = pgTable("plaid_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  plaidItemId: text("plaid_item_id").notNull().unique(),
  // AES-256-GCM encrypted Plaid access token. Never sent to the browser.
  accessTokenEnc: text("access_token_enc").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  // Cursor for /transactions/sync. Null means "start from the beginning".
  cursor: text("cursor"),
  // Which Plaid environment created this connection: sandbox or production.
  // Tokens only work in the environment that issued them, so connections from
  // the other environment are skipped by sync and can be cleaned up.
  // Existing rows predate production, so they default to sandbox.
  plaidEnv: text("plaid_env").notNull().default("sandbox"),
  // good | login_required | error
  status: text("status").notNull().default("good"),
  errorCode: text("error_code"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  linkedByUserId: uuid("linked_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  plaidAccountId: text("plaid_account_id").notNull().unique(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => plaidItems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  officialName: text("official_name"),
  mask: text("mask"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  currentBalance: numeric("current_balance", { precision: 14, scale: 2 }),
  availableBalance: numeric("available_balance", { precision: 14, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code"),
  // Hidden accounts are still synced but left out of spending totals.
  hidden: boolean("hidden").notNull().default(false),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#64748b"),
  // Transfers, card payments and income are not "spending".
  excludeFromSpending: boolean("exclude_from_spending").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plaidTransactionId: text("plaid_transaction_id").notNull().unique(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // Plaid convention: positive = money out (a purchase), negative = money in.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    isoCurrencyCode: text("iso_currency_code"),
    date: date("date").notNull(),
    authorizedDate: date("authorized_date"),
    name: text("name").notNull(),
    merchantName: text("merchant_name"),
    logoUrl: text("logo_url"),
    pfcPrimary: text("pfc_primary"),
    pfcDetailed: text("pfc_detailed"),
    pending: boolean("pending").notNull().default(false),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    // True when a person picked the category by hand. Sync never overwrites it.
    categoryOverridden: boolean("category_overridden").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transactions_date_idx").on(t.date), index("transactions_category_idx").on(t.categoryId)],
);

// Which of our categories each Plaid category feeds into. A Plaid key is a
// personal_finance_category primary value like FOOD_AND_DRINK, or a detailed
// one like FOOD_AND_DRINK_GROCERIES for the few we split out. Merging
// categories repoints these rows, so several Plaid keys can share a category.
export const plaidCategoryMap = pgTable("plaid_category_map", {
  plaidKey: text("plaid_key").primaryKey(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
});

// "Always put this merchant in this category."
export const categoryRules = pgTable("category_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Lower-cased merchant name (or transaction name when Plaid has no merchant).
  merchantKey: text("merchant_key").notNull().unique(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One monthly budget per category, repeating every month.
export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .unique()
    .references(() => categories.id, { onDelete: "cascade" }),
  monthlyAmount: numeric("monthly_amount", { precision: 14, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type PlaidItem = typeof plaidItems.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
