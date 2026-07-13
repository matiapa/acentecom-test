import type { ShopifyClient } from "./client.js";
import { PRODUCTS_QUERY, ORDERS_QUERY, CUSTOMERS_QUERY, SHOP_QUERY } from "./queries.js";
import { toProductRow, toVariantRows, toOrderRow, toLineItemRows, toCustomerRow } from "../transform.js";
import type { SyncData } from "../types.js";

export async function fetchShop(client: ShopifyClient): Promise<{ currencyCode: string; ianaTimezone: string }> {
  const data = await client.graphql<{ shop: { currencyCode: string; ianaTimezone: string } }>(SHOP_QUERY);
  return data.shop;
}

export async function fetchSyncData(client: ShopifyClient): Promise<SyncData> {
  const data: SyncData = { products: [], variants: [], customers: [], orders: [], lineItems: [] };

  for await (const node of client.paginate<any>(PRODUCTS_QUERY, "products")) {
    data.products.push(toProductRow(node));
    data.variants.push(...toVariantRows(node));
  }
  for await (const node of client.paginate<any>(ORDERS_QUERY, "orders")) {
    data.orders.push(toOrderRow(node));
    data.lineItems.push(...toLineItemRows(node));
  }
  // Customers may be entirely inaccessible on dev/free Shopify plans (PII gating).
  // Treat that as non-fatal: the core deliverable (products + orders) must still sync.
  try {
    for await (const node of client.paginate<any>(CUSTOMERS_QUERY, "customers")) {
      data.customers.push(toCustomerRow(node));
    }
  } catch (err) {
    console.warn(`Skipping customers (not accessible on this Shopify plan): ${(err as Error).message.slice(0, 140)}`);
  }
  return data;
}
