import { expect, test, vi } from "vitest";
import { ShopifyClient } from "../src/shopify/client.js";
import type { Config } from "../src/config.js";

const config = {
  shopifyStoreDomain: "s.myshopify.com", shopifyAdminToken: "t", shopifyApiVersion: "2025-10",
  supabaseDbUrl: "x", supabaseProjectRef: "r", syncTtlSeconds: 300, reportTimezone: "UTC",
} as Config;

const jsonRes = (body: object) => ({ ok: true, status: 200, json: async () => body }) as Response;

test("graphql retries on THROTTLED then returns data", async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(jsonRes({ errors: [{ extensions: { code: "THROTTLED" } }] }))
    .mockResolvedValueOnce(jsonRes({ data: { ok: 1 } }));
  const c = new ShopifyClient(config, fetchFn as any);
  const data = await c.graphql<{ ok: number }>("query{ok}");
  expect(data.ok).toBe(1);
  expect(fetchFn).toHaveBeenCalledTimes(2);
});

test("paginate yields nodes across pages", async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(jsonRes({ data: { things: { nodes: [{ id: 1 }], pageInfo: { hasNextPage: true, endCursor: "c1" } } } }))
    .mockResolvedValueOnce(jsonRes({ data: { things: { nodes: [{ id: 2 }], pageInfo: { hasNextPage: false, endCursor: null } } } }));
  const c = new ShopifyClient(config, fetchFn as any);
  const out: any[] = [];
  for await (const n of c.paginate<{ id: number }>("query($cursor:String){things}", "things")) out.push(n);
  expect(out.map((x) => x.id)).toEqual([1, 2]);
});
