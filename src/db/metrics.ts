import type pg from "pg";
import type { Metrics, SyncState } from "../types.js";

const asMetrics = (row: any): Metrics => ({
  new_orders: Number(row.new_orders), revenue: Number(row.revenue),
  new_products: Number(row.new_products), units_sold: Number(row.units_sold),
});

export async function getDailyMetrics(pool: pg.Pool): Promise<Metrics> {
  const { rows } = await pool.query("select * from daily_metrics");
  return asMetrics(rows[0]);
}

export async function getWeeklyMetrics(pool: pg.Pool): Promise<Metrics> {
  const { rows } = await pool.query("select * from weekly_metrics");
  return asMetrics(rows[0]);
}

export async function getSyncState(pool: pg.Pool): Promise<SyncState> {
  const { rows } = await pool.query("select last_synced_at, last_status, last_error from sync_state where id = 1");
  const r = rows[0] ?? {};
  return {
    last_synced_at: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
    last_status: r.last_status ?? null, last_error: r.last_error ?? null,
  };
}

export async function getStoreCurrency(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query("select store_currency from app_config where id = 1");
  return rows[0]?.store_currency ?? "";
}
