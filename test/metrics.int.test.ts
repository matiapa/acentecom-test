import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type pg from "pg";
import { loadConfig } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import { getWeeklyMetrics } from "../src/db/metrics.js";

const hasDb = !!process.env.SUPABASE_DB_URL;

describe.skipIf(!hasDb)("metric layer (integration)", () => {
  // Pool creation deferred to beforeAll: describe.skipIf still runs the factory body
  // during collection even when skipped, so calling getPool(loadConfig()) at describe-body
  // scope would throw on missing env vars regardless of the skip condition.
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = getPool(loadConfig());
    await runMigrations(pool);
    await pool.query("update app_config set report_timezone = 'UTC' where id = 1");
    await pool.query("delete from order_line_items; delete from orders; delete from products;");
    // valid paid order today: net 90 (100 - 10 refund)
    await pool.query(`insert into orders (shopify_id,name,currency,test,total_price,total_refunded,created_at,cancelled_at)
      values (1,'#1','USD',false,100,10,now(),null)`);
    // cancelled order today: excluded
    await pool.query(`insert into orders (shopify_id,name,currency,test,total_price,total_refunded,created_at,cancelled_at)
      values (2,'#2','USD',false,50,0,now(),now())`);
    // test order today: excluded
    await pool.query(`insert into orders (shopify_id,name,currency,test,total_price,total_refunded,created_at,cancelled_at)
      values (3,'#3','USD',true,50,0,now(),null)`);
  });
  afterAll(async () => { await pool.end(); });

  test("weekly revenue nets refunds and excludes cancelled/test orders", async () => {
    const m = await getWeeklyMetrics(pool);
    expect(m.new_orders).toBe(1);
    expect(Number(m.revenue)).toBe(90);
  });
});
