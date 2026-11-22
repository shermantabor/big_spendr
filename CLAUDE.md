@AGENTS.md

# Big Spendr

Household budgeting app: Next.js 16 App Router + Drizzle (Postgres) + Plaid. See README.md for the architecture.

- Plaid SDK is v52 (`PlaidClient` from "plaid", responses are the body, errors are `PlaidError`). Don't use the legacy `PlaidApi`.
- Plaid amounts: positive = money out. Spending sums `amount` across non-excluded categories and non-hidden accounts.
- Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, commit the migration.
- Check work with `npm run lint` and `npm run typecheck`.
