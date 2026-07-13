import type pg from "pg";
import { loadConfig, type Config } from "./config.js";
import { getPool } from "./db/pool.js";
import { withAdvisoryLock, upsertAll } from "./db/upsert.js";
import { ShopifyClient } from "./shopify/client.js";
import { fetchSyncData, fetchShop } from "./shopify/fetchers.js";
import type { SyncCounts } from "./types.js";

export interface SyncResult { skipped: boolean; counts?: SyncCounts }

async function isStale(pool: pg.Pool, ttlSeconds: number): Promise<boolean> {
  const { rows } = await pool.query(
    "select last_synced_at, extract(epoch from (now() - last_synced_at)) as age from sync_state where id = 1",
  );
  const r = rows[0];
  if (!r || r.last_synced_at == null) return true;
  return Number(r.age) >= ttlSeconds;
}

function assertSingleCurrency(currencies: Set<string>): void {
  const distinct = [...currencies].filter((c) => c && c.length > 0);
  if (distinct.length > 1) {
    throw new Error(
      `Multiple order currencies found (${distinct.join(", ")}). Revenue sums assume a single ` +
        `currency; aborting rather than summing incomparable money.`,
    );
  }
}

export async function runSyncIfStale(
  opts: { force?: boolean; pool?: pg.Pool; client?: ShopifyClient; config?: Config } = {},
): Promise<SyncResult> {
  const config = opts.config ?? loadConfig();
  const pool = opts.pool ?? getPool(config);
  const client = opts.client ?? new ShopifyClient(config);
  const ownsPool = !opts.pool;

  try {
    return await withAdvisoryLock(pool, async () => {
      if (!opts.force && !(await isStale(pool, config.syncTtlSeconds))) {
        return { skipped: true };
      }
      const started = Date.now();
      try {
        const shop = await fetchShop(client);
        const data = await fetchSyncData(client);
        assertSingleCurrency(new Set(data.orders.map((o) => o.currency)));

        const counts = await upsertAll(pool, data);
        await pool.query(
          "update app_config set report_timezone = $1, store_currency = $2 where id = 1",
          [config.reportTimezone, shop.currencyCode],
        );
        await pool.query(
          `update sync_state set last_synced_at = now(), last_status = 'success', last_error = null,
             products_synced = $1, variants_synced = $2, orders_synced = $3, line_items_synced = $4,
             customers_synced = $5, duration_ms = $6, updated_at = now() where id = 1`,
          [counts.products, counts.variants, counts.orders, counts.lineItems, counts.customers, Date.now() - started],
        );
        return { skipped: false, counts };
      } catch (err) {
        await pool.query(
          "update sync_state set last_status = 'error', last_error = $1, updated_at = now() where id = 1",
          [(err as Error).message],
        );
        throw err;
      }
    });
  } finally {
    if (ownsPool) await pool.end();
  }
}
