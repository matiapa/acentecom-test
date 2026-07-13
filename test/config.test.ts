import { expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const full = {
  SHOPIFY_STORE_DOMAIN: "s.myshopify.com", SHOPIFY_ADMIN_TOKEN: "shpat_x",
  SHOPIFY_API_VERSION: "2025-10",
  SUPABASE_DB_URL: "postgresql://u:p@h:5432/postgres", SUPABASE_PROJECT_REF: "ref",
};

test("loads a valid config with defaults", () => {
  const c = loadConfig(full);
  expect(c.shopifyStoreDomain).toBe("s.myshopify.com");
  expect(c.syncTtlSeconds).toBe(300);
  expect(c.reportTimezone).toBe("UTC");
});

test("throws listing all missing required vars", () => {
  expect(() => loadConfig({})).toThrowError(/SHOPIFY_STORE_DOMAIN.*SHOPIFY_ADMIN_TOKEN.*SUPABASE_DB_URL/s);
});

test("parses SYNC_TTL_SECONDS as a number", () => {
  const c = loadConfig({ ...full, SYNC_TTL_SECONDS: "60" });
  expect(c.syncTtlSeconds).toBe(60);
});
