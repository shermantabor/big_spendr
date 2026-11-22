import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db?: DB };

function getDb(): DB {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See README.md.");
    // prepare:false keeps this compatible with Neon's pooled (PgBouncer) URLs.
    const client = postgres(url, { prepare: false, max: 5 });
    globalForDb.db = drizzle({ client, schema });
  }
  return globalForDb.db;
}

// Connects lazily on first use, so builds without DATABASE_URL still succeed.
export const db = new Proxy({} as DB, {
  get: (_target, prop) => Reflect.get(getDb(), prop),
});

export * as s from "./schema";
