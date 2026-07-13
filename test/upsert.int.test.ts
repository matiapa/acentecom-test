import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type pg from "pg";
import { loadConfig } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import { upsertAll } from "../src/db/upsert.js";
import type { SyncData } from "../src/types.js";

const hasDb = !!process.env.SUPABASE_DB_URL;

describe.skipIf(!hasDb)("upsertAll (integration)", () => {
  // Pool creation is deferred to beforeAll (not evaluated at describe-body scope):
  // describe.skipIf still runs the factory body during collection even when skipped,
  // so calling getPool(loadConfig()) here would throw on missing env vars regardless
  // of the skip. beforeAll/test bodies are the parts vitest actually skips.
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = getPool(loadConfig());
    await runMigrations(pool);
  });
  afterAll(async () => { await pool.end(); });

  const data: SyncData = {
    products: [{ shopify_id: 1, title: "Tee", handle: null, vendor: null, product_type: null,
      status: "active", tags: [], total_inventory: null, min_price: 10, max_price: 10,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    variants: [], customers: [],
    orders: [{ shopify_id: 100, name: "#1001", customer_id: null, email: null,
      financial_status: "paid", fulfillment_status: null, currency: "USD", test: false,
      subtotal_price: 10, total_tax: 0, total_discounts: 0, total_refunded: 0, total_price: 10,
      created_at: "2026-01-05T00:00:00Z", processed_at: null, updated_at: "2026-01-05T00:00:00Z",
      cancelled_at: null }],
    lineItems: [],
  };

  test("inserts then re-upserts without duplicating", async () => {
    const c1 = await upsertAll(pool, data);
    expect(c1.orders).toBe(1);
    await upsertAll(pool, data);
    const { rows } = await pool.query("select count(*)::int as n from orders where shopify_id = 100");
    expect(rows[0].n).toBe(1);
  });
});
