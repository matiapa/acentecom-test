import { expect, test } from "vitest";
import type { OrderRow, SyncData } from "../src/types.js";

test("OrderRow shape compiles and is constructible", () => {
  const o: OrderRow = {
    shopify_id: 1, name: "#1001", customer_id: null, email: null,
    financial_status: "paid", fulfillment_status: null, currency: "USD",
    test: false, subtotal_price: 10, total_tax: 0, total_discounts: 0,
    total_refunded: 0, total_price: 10, created_at: "2026-01-01T00:00:00Z",
    processed_at: null, updated_at: "2026-01-01T00:00:00Z", cancelled_at: null,
  };
  const data: SyncData = { products: [], variants: [], customers: [], orders: [o], lineItems: [] };
  expect(data.orders[0].name).toBe("#1001");
});
