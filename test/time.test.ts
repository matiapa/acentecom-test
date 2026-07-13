import { expect, test } from "vitest";
import { formatAsOf, weekWindowLabel } from "../src/time.js";

test("formatAsOf renders a readable timestamp or 'never'", () => {
  expect(formatAsOf(null)).toBe("never");
  expect(formatAsOf("2026-01-05T09:30:00Z")).toMatch(/2026-01-05/);
});

test("weekWindowLabel names the timezone", () => {
  expect(weekWindowLabel("UTC")).toBe("this week (Mon–now, UTC)");
});
