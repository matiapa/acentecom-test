import type { Metrics } from "./types.js";
import { formatAsOf } from "./time.js";

export interface ReportInput {
  daily: Metrics; weekly: Metrics; currency: string; syncedAt: string | null; syncFailed: boolean;
}

const section = (title: string, m: Metrics, currency: string): string =>
  [`## ${title}`,
   `- New orders: ${m.new_orders}`,
   `- Revenue: ${m.revenue} ${currency}`.trimEnd(),
   `- New products: ${m.new_products}`,
   `- Units sold: ${m.units_sold}`].join("\n");

export function formatReport(input: ReportInput): string {
  const parts = [
    `# Daily Store Report`,
    input.syncFailed ? `> ⚠️ Data refresh failed — showing last-good data.` : "",
    section("Today", input.daily, input.currency),
    section("This week (Mon–now)", input.weekly, input.currency),
    `_data as of ${formatAsOf(input.syncedAt)}_`,
  ];
  return parts.filter(Boolean).join("\n\n");
}
