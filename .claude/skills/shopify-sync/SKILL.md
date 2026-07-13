---
name: shopify-sync
description: >-
  Pull the latest products, orders, and customers from Shopify and store them in
  Supabase. Use when the user wants to refresh, sync, import, or update the store
  data — e.g. "sync the store", "refresh the data", "import the latest orders",
  "update Supabase from Shopify". Safe to run repeatedly; it updates in place and
  never duplicates.
---

# Shopify → Supabase sync

Run the ETL that pulls Shopify data and upserts it into Supabase.

## When to use
- The user asks to refresh/sync/import/update store data.
- Before answering a data question or building a report, if data may be stale.

## How to run
From the project root:

```bash
npm run sync
```

- The sync is **TTL-guarded**: if data was synced within `SYNC_TTL_SECONDS` (default 300s),
  it prints "Data is fresh — sync skipped" and does nothing.
- To force a full refresh regardless of freshness:

```bash
npm run sync -- --force
```

## What it does
Pulls products (+variants), orders (+line items), and customers; upserts them into
Supabase keyed on the Shopify id (idempotent — re-running updates, never duplicates);
records `sync_state` and the shop currency.

## Prerequisites
`.env` must be filled in (copy from `.env.example`) and migrations applied once with
`npm run migrate`. If the sync fails, it prints which credential to check.
