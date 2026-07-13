import { expect, test } from "vitest";
import { gidToId, money, toProductRow, toVariantRows, toCustomerRow } from "../src/transform.js";

test("gidToId extracts numeric id, handles null", () => {
  expect(gidToId("gid://shopify/Product/12345")).toBe(12345);
  expect(gidToId(null)).toBe(null);
});

test("money parses shopMoney string to number, handles null", () => {
  expect(money({ amount: "19.90" })).toBe(19.9);
  expect(money(null)).toBe(null);
});

test("toProductRow maps status to lowercase and price range", () => {
  const node = {
    id: "gid://shopify/Product/1", title: "Tee", handle: "tee", vendor: "Acme",
    productType: "Shirt", status: "ACTIVE", tags: ["a", "b"], totalInventory: 5,
    priceRangeV2: { minVariantPrice: { amount: "10.00" }, maxVariantPrice: { amount: "20.00" } },
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z",
  };
  const r = toProductRow(node);
  expect(r).toEqual({
    shopify_id: 1, title: "Tee", handle: "tee", vendor: "Acme", product_type: "Shirt",
    status: "active", tags: ["a", "b"], total_inventory: 5, min_price: 10, max_price: 20,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
  });
});

test("toVariantRows links product_id and parses money", () => {
  const node = {
    id: "gid://shopify/Product/1",
    variants: { nodes: [{
      id: "gid://shopify/ProductVariant/9", title: "S", sku: "T-S", price: "10.00",
      compareAtPrice: null, inventoryQuantity: 3, position: 1,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    }] },
  };
  expect(toVariantRows(node)[0]).toEqual({
    shopify_id: 9, product_id: 1, title: "S", sku: "T-S", price: 10, compare_at_price: null,
    inventory_quantity: 3, position: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });
});

test("toCustomerRow maps names and amountSpent", () => {
  const node = {
    id: "gid://shopify/Customer/7", email: "a@b.com", firstName: "A", lastName: "B",
    numberOfOrders: "2", amountSpent: { amount: "50.00" }, state: "ENABLED",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
  expect(toCustomerRow(node)).toEqual({
    shopify_id: 7, email: "a@b.com", first_name: "A", last_name: "B", orders_count: 2,
    total_spent: 50, state: "enabled", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });
});
