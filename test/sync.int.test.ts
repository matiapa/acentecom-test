import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type pg from "pg";
import { loadConfig } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSyncIfStale } from "../src/sync.js";

const hasDb = !!process.env.SUPABASE_DB_URL;

describe.skipIf(!hasDb)("runSyncIfStale (integration)", () => {
  // Pool creation deferred to beforeAll: describe.skipIf still runs the factory body
  // during collection even when skipped, so calling getPool(loadConfig()) at describe-body
  // scope would throw on missing env vars regardless of the skip condition.
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = getPool(loadConfig());
    await runMigrations(pool);
  });
  afterAll(async () => { await pool.end(); });

  const fakeClient = {
    async graphql() { return { shop: { currencyCode: "USD", ianaTimezone: "UTC" } }; },
    async *paginate(_q: string, key: string) {
      if (key === "orders") yield {
        id: "gid://shopify/Order/100", name: "#1001", test: false,
        totalPriceSet: { shopMoney: { amount: "10", currencyCode: "USD" } },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        lineItems: { nodes: [] },
      };
    },
  } as any;

  test("force sync writes rows and stamps sync_state; second call within TTL skips", async () => {
    const r1 = await runSyncIfStale({ force: true, pool, client: fakeClient });
    expect(r1.skipped).toBe(false);
    const state = await pool.query("select last_status, store_currency from sync_state, app_config where sync_state.id=1 and app_config.id=1");
    expect(state.rows[0].last_status).toBe("success");
    expect(state.rows[0].store_currency).toBe("USD");
    const r2 = await runSyncIfStale({ pool, client: fakeClient });
    expect(r2.skipped).toBe(true);
  });
});
