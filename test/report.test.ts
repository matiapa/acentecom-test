import { expect, test } from "vitest";
import { formatReport } from "../src/report.js";

const m = (o: Partial<any> = {}) => ({ new_orders: 0, revenue: 0, new_products: 0, units_sold: 0, ...o });

test("formatReport renders today and this-week sections with currency", () => {
  const out = formatReport({
    daily: m({ new_orders: 2, revenue: 44, new_products: 1, units_sold: 3 }),
    weekly: m({ new_orders: 5, revenue: 120.5, new_products: 2, units_sold: 9 }),
    currency: "USD", syncedAt: "2026-01-05T09:30:00Z", syncFailed: false,
  });
  expect(out).toContain("New orders: 2");
  expect(out).toContain("Revenue: 44 USD");
  expect(out).toContain("120.5 USD");
  expect(out).toContain("data as of");
  expect(out).not.toContain("refresh failed");
});

test("formatReport flags a failed refresh", () => {
  const out = formatReport({ daily: m(), weekly: m(), currency: "USD", syncedAt: null, syncFailed: true });
  expect(out).toContain("refresh failed");
  expect(out).toContain("data as of never");
});
