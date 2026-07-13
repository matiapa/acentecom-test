---
name: daily-report
description: >-
  Produce a short daily store report — new orders, revenue, new products, and units
  sold, for today and this week. Use when the user asks "daily report", "how did the
  store do today", "give me the store summary", or "what's our revenue this week". The
  numbers are computed directly in SQL from Supabase (never estimated), on freshly
  synced data.
---

# Daily store report

Generate the deterministic daily report.

## When to use
- The user asks for the daily/store report or a summary of orders/revenue/products.

## How to run
From the project root:

```bash
npm run report
```

## What it does
1. Refreshes data first (TTL-guarded sync; if the refresh fails it still reports on
   last-good data and clearly flags it).
2. Reads the `daily_metrics` and `weekly_metrics` SQL views — the same source of truth
   the analyst agent uses — so the report and ad-hoc answers always agree.
3. Prints a short markdown report with a "data as of <timestamp>" line, every money
   figure labelled with the store currency.

## Notes
- Revenue nets refunds and excludes cancelled and test orders, so it reconciles with
  the Shopify admin.
- All numbers come from SQL; nothing is estimated or rounded by a model.
