import type pg from "pg";
import type { SyncData, SyncCounts } from "../types.js";

export const SYNC_LOCK_KEY = 4711;

export async function withAdvisoryLock<T>(pool: pg.Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [SYNC_LOCK_KEY]);
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [SYNC_LOCK_KEY]);
    client.release();
  }
}

async function upsertRows(
  client: pg.PoolClient, table: string, columns: string[], conflictSet: string[], rows: object[],
): Promise<number> {
  if (rows.length === 0) return 0;
  for (const row of rows) {
    const values = columns.map((c) => (row as any)[c] ?? null);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const updates = conflictSet.map((c) => `${c} = excluded.${c}`).concat("synced_at = now()").join(", ");
    await client.query(
      `insert into ${table} (${columns.join(", ")}, synced_at) values (${placeholders}, now())
       on conflict (shopify_id) do update set ${updates}`,
      values,
    );
  }
  return rows.length;
}

export async function upsertAll(pool: pg.Pool, data: SyncData): Promise<SyncCounts> {
  const client = await pool.connect();
  const counts: SyncCounts = { products: 0, variants: 0, customers: 0, orders: 0, lineItems: 0 };
  const customerCols = ["shopify_id", "email", "first_name", "last_name", "orders_count", "total_spent", "state", "created_at", "updated_at"];
  const productCols = ["shopify_id", "title", "handle", "vendor", "product_type", "status", "tags", "total_inventory", "min_price", "max_price", "created_at", "updated_at"];
  const variantCols = ["shopify_id", "product_id", "title", "sku", "price", "compare_at_price", "inventory_quantity", "position", "created_at", "updated_at"];
  const orderCols = ["shopify_id", "name", "customer_id", "email", "financial_status", "fulfillment_status", "currency", "test", "subtotal_price", "total_tax", "total_discounts", "total_refunded", "total_price", "created_at", "processed_at", "updated_at", "cancelled_at"];
  const lineItemCols = ["shopify_id", "order_id", "product_id", "variant_id", "title", "variant_title", "sku", "quantity", "price", "total_discount"];

  const nonPk = (cols: string[]) => cols.filter((c) => c !== "shopify_id");
  try {
    await client.query("begin");
    counts.customers = await upsertRows(client, "customers", customerCols, nonPk(customerCols), data.customers);
    counts.products = await upsertRows(client, "products", productCols, nonPk(productCols), data.products);
    counts.variants = await upsertRows(client, "product_variants", variantCols, nonPk(variantCols), data.variants);
    counts.orders = await upsertRows(client, "orders", orderCols, nonPk(orderCols), data.orders);
    counts.lineItems = await upsertRows(client, "order_line_items", lineItemCols, nonPk(lineItemCols), data.lineItems);
    await client.query("commit");
    return counts;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
