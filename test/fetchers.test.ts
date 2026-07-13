import { expect, test } from "vitest";
import { fetchSyncData } from "../src/shopify/fetchers.js";

function fakeClient(pages: Record<string, any[]>) {
  return {
    async graphql() { return { shop: { currencyCode: "USD", ianaTimezone: "UTC" } }; },
    async *paginate(_q: string, key: string) {
      const which = key === "products" ? "products" : key === "orders" ? "orders" : "customers";
      for (const n of pages[which] ?? []) yield n;
    },
  } as any;
}

test("fetchSyncData assembles products, variants, orders, line items, customers", async () => {
  const client = fakeClient({
    products: [{ id: "gid://shopify/Product/1", title: "Tee", status: "ACTIVE", tags: [],
      priceRangeV2: { minVariantPrice: { amount: "10" }, maxVariantPrice: { amount: "10" } },
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      variants: { nodes: [{ id: "gid://shopify/ProductVariant/9", title: "S", price: "10",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }] } }],
    orders: [{ id: "gid://shopify/Order/100", name: "#1001", test: false,
      totalPriceSet: { shopMoney: { amount: "10", currencyCode: "USD" } },
      createdAt: "2026-01-05T00:00:00Z", updatedAt: "2026-01-05T00:00:00Z",
      lineItems: { nodes: [{ id: "gid://shopify/LineItem/500", title: "Tee", quantity: 1,
        originalUnitPriceSet: { shopMoney: { amount: "10" } } }] } }],
    customers: [{ id: "gid://shopify/Customer/7", email: "c@d.com",
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
  });
  const data = await fetchSyncData(client);
  expect(data.products).toHaveLength(1);
  expect(data.variants).toHaveLength(1);
  expect(data.orders).toHaveLength(1);
  expect(data.lineItems).toHaveLength(1);
  expect(data.customers).toHaveLength(1);
  expect(data.variants[0].product_id).toBe(1);
  expect(data.lineItems[0].order_id).toBe(100);
});
