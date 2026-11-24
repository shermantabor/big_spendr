# Big Spendr

A private budgeting app for one household. It pulls your credit card and bank
transactions in automatically through [Plaid](https://plaid.com), sorts them
into categories built from your own spending history, and tracks each month
against a budget per category.

**Stack:** Next.js 16 (App Router, TypeScript) · Postgres (Neon) with Drizzle
ORM · Plaid Transactions · Tailwind CSS · hosted on Render.

## How it works

- **Connecting accounts.** The Accounts page opens Plaid Link. After you sign in
  to your bank, the app saves an encrypted access token and imports up to two
  years of history.
- **Staying up to date.** Plaid calls `/api/plaid/webhook` when it sees new or
  changed transactions (`SYNC_UPDATES_AVAILABLE`), and the app pulls them right
  away using `/transactions/sync`. A Render cron job (`render.yaml`) also syncs
  every connection once a day at 11:00 UTC in case a webhook is missed. There's
  a "Sync now" button too.
  - How fresh is "real time"? Plaid checks most banks for new transactions
    several times a day, so new charges usually show up within a few hours,
    pending ones included. Faster on-demand refreshes are a paid Plaid add-on
    (`/transactions/refresh`).
- **Categories.** Each transaction comes with Plaid's category (e.g.
  `FOOD_AND_DRINK`). The first time a Plaid category appears in your history,
  the app creates a matching category (Groceries, Gas and Credit Card Payments
  are split out from their parents). You can rename, recolor, merge and add
  categories on the Budgets page.
- **Recategorizing.** Change a transaction's category on the Transactions page.
  You'll be asked whether to apply it to every transaction from that merchant;
  if yes, a rule is saved and future transactions follow it too. Categories you
  set by hand are never overwritten by a sync.
- **Budgets.** One monthly amount per category, repeating every month. The
  Budgets page suggests amounts from your average monthly spending over the
  last 3, 6 or 12 complete months (rounded up), and "Use suggestions" fills
  them in.
- **What counts as spending.** Transfers, credit card payments, loan
  disbursements and income are marked "Not spending" so card payments aren't
  counted twice. You can toggle this per category, and exclude whole accounts
  (say, a joint savings account) on the Accounts page.
- **Sign-in.** Email and password. Only emails listed in `ALLOWED_EMAILS` can
  create an account. Everyone who signs in shares the same household data.

## Setup

You need: Node.js 20.9+ ([nodejs.org](https://nodejs.org)), a free
[Plaid](https://dashboard.plaid.com/signup) account, and a free
[Render](https://render.com) account, and a free [Neon](https://neon.tech) account for the database.

### 1. Get Plaid keys

1. Sign up at https://dashboard.plaid.com/signup.
2. Go to **Developers → Keys**. Copy your `client_id` and the **Sandbox** secret.

Sandbox uses fake banks, so you can try everything before connecting real
accounts. In Plaid Link, pick any bank and sign in with
`user_transactions_dynamic` (any password) for realistic transactions, or
`user_good` / `pass_good`.

### 2. Create the database (Neon)

1. Sign up at https://neon.tech and create a project (pick a US East region,
   e.g. AWS us-east-1, close to Render's Virginia region).
2. On the project dashboard click **Connect**, keep **Connection pooling** on,
   and copy the connection string (`postgresql://…-pooler…/neondb?sslmode=require`).
   That's your `DATABASE_URL`.

### 3. Deploy to Render

`render.yaml` describes everything, so Render sets it up in one pass:

1. In Render, click **New → Blueprint** and connect the `big_spendr` GitHub
   repository. Pick the same region as your database (Virginia for US East).
2. Render shows the two services it will create: **big-spendr** (the web app)
   and **big-spendr-daily-sync** (the daily cron job). It generates
   `SESSION_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` itself and asks you for:
   - `DATABASE_URL`: the Neon string from step 2
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox` or `production`,
     matching the secret)
   - `ALLOWED_EMAILS`: your two emails, comma separated
   - `APP_URL` (on the cron job): the web app's address. It's
     `https://big-spendr.onrender.com` unless that name is taken; if Render
     gives a different address, update this afterwards under the cron job's
     **Environment** tab.
3. Click **Apply**. The first build applies the database migrations
   automatically. When the web service shows **Live**, open its URL, click
   **Create your account**, and your partner does the same.

To change a setting later: open the service in Render → **Environment** → edit
→ **Save, rebuild, and deploy**.

**Free vs. paid.** The web app starts on Render's free plan: it sleeps after 15
minutes without visitors and takes about a minute to wake up, so the first page
load of the day is slow. Plaid's notifications still arrive (they wake it up,
and Plaid retries if needed). For an always-on app, switch it to **Starter**
($7/month) under the service's **Settings → Instance Type**. The daily sync job
can't use the free plan; it runs for a few seconds a day and costs Render's $1
monthly minimum.

Keep `ENCRYPTION_KEY` safe and don't change it: it encrypts the stored bank
tokens, and changing it means re-linking every account.

### 4. Run it locally (VS Code)

```sh
npm install
cp .env.example .env.local   # then fill it in
npm run db:migrate
npm run dev                  # http://localhost:3000
```

For `DATABASE_URL` locally you can use the same Neon database, or better, a
separate Neon branch (Neon console → Branches) so local testing doesn't touch
your real data. Any Postgres 14+ works too.

Plaid can't send webhooks to `localhost`, so locally use **Sync now** to pull
new transactions.

### 5. Switch to your real accounts

1. **Get production access.** In the Plaid dashboard, apply for the free
   **Trial plan** (dashboard.plaid.com/trial-plan). It uses real bank data,
   includes Transactions, and covers most big banks (Chase, Bank of America,
   Wells Fargo, Capital One, Citi, Amex and more) with no extra OAuth
   registration. Most applications are approved automatically; flagged ones
   take 2–3 business days. The catch: **10 bank connections total, ever.**
   Removing one doesn't free its slot, and connecting the same bank twice uses
   two. (Teams created before April 15, 2026 can't use the Trial; they apply
   for Pay-as-you-go Production instead, which bills each connection monthly.)
2. **Copy the Production secret** from Developers → Keys. The `client_id` stays
   the same; the secret is different from the sandbox one.
3. **In Render → big-spendr → Environment**, set `PLAID_ENV` to `production`
   and replace `PLAID_SECRET` with the Production secret, then **Save, rebuild,
   and deploy**.
4. **Clean up test data.** Open Accounts. Your sandbox connections show as
   "Test data" and stop syncing. Click **Remove sandbox data** so fake
   transactions don't skew your totals and budget suggestions.
5. **Connect your real banks**, once each. If a bank later needs you to sign in
   again, use **Fix connection** rather than connecting it again.
6. Optional, for connecting from a phone: add
   `https://<your-app>.onrender.com/oauth` under Developers → API → Allowed
   redirect URIs, and set `PLAID_REDIRECT_URI` to the same URL. On a computer,
   bank sign-in pages open in a popup and don't need this.

The app records which Plaid environment created each connection, so you can
switch back to sandbox later for testing without breaking anything; it just
skips connections from the other environment.

## Project layout

```
src/
  app/
    (auth)/login, (auth)/signup       Sign-in pages
    (app)/page.tsx                     Overview: month vs. budget, trend, recent
    (app)/transactions                 Search, filter, recategorize, notes
    (app)/budgets                      Budgets, suggestions, manage categories
    (app)/accounts                     Connect banks, sync, fix logins
    (app)/oauth                        Return page for OAuth banks
    actions/                           Server actions (forms)
    api/plaid/link-token               Starts Plaid Link
    api/plaid/exchange                 Saves a new connection, first import
    api/plaid/webhook                  Plaid webhooks (signature verified)
    api/plaid/resync                   Sync one connection
    api/cron/sync                      Daily sync (called by the Render cron job)
  db/schema.ts                         Database tables (Drizzle)
  lib/sync.ts                          /transactions/sync → database
  lib/categories.ts                    Plaid category → your categories
  lib/queries.ts                       Spending, budgets, suggestions
  lib/plaid-webhook.ts                 Webhook signature check
  lib/crypto.ts                        Access token encryption
drizzle/                               SQL migrations
scripts/migrate.mjs                    Runs migrations before each build
scripts/trigger-sync.mjs               What the daily cron job runs
render.yaml                            Render setup (web app + cron job)
```

### Changing the database

Edit `src/db/schema.ts`, then run `npm run db:generate` to create a migration
in `drizzle/`. Commit it. The next deploy applies it.

## Security notes

- Plaid access tokens are encrypted with AES-256-GCM before they're stored and
  never reach the browser.
- Webhooks are rejected unless Plaid's signed `Plaid-Verification` header checks out.
- The cron endpoint requires `CRON_SECRET`, which Render generates and shares with the cron job.
- Passwords are hashed with bcrypt. Sessions are encrypted, httpOnly cookies.
