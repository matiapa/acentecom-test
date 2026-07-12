# Shopify → Supabase Store Assistant — Design

- **Date:** 2026-07-11
- **Status:** Approved (design), revised
- **Owner:** Andini (AI Developer assignment)

> A running narrative of *why* each choice was made lives in `docs/DESIGN-JOURNAL.md` (for the interviewer). This spec is the *what*.

## 1. Goal

Build one small but fully working assistant, delivered entirely as **Claude Code skills and agents**, that runs the whole path:

**pull Shopify data → clean it → store in Supabase → answer questions → produce a daily report.**

It must work end-to-end, always work on **fresh** data, never invent numbers, and be usable by a non-technical teammate. Secrets are never hardcoded.

## 2. Requirements

### Functional
- **F1 — Pull:** Connect to a Shopify dev store and pull **products** (with variants), **orders** (with line items), and **customers** via the Admin API. Clean/normalize into a clear, flat shape.
- **F2 — Store:** Create the needed Supabase (Postgres) tables and write the data in. Re-running the sync **updates, does not duplicate** (idempotent upsert).
- **F3 — Answer:** An agent reads the database and answers plain-language questions (e.g. "how many orders this week"). It **refreshes data first**, and numbers come **only** from the database — never invented.
- **F4 — Report:** A skill builds a short daily report — **new orders, revenue, new products** — on fresh data, in a simple readable form.
- **F5 — Ship:** Everything is packaged as real Claude Code skills/agents, each with a clear description of **when it triggers**, usable by a non-technical teammate.

### Non-functional
- **Fresh data:** every report/answer runs against data synced within a staleness window.
- **Security:** No secrets in code or committed files. Write path uses a gitignored `.env`; read path (agent) uses OAuth with a DB-enforced read-only role.
- **No hallucinated numbers:** Every reported number traces to a real query result.
- **Reproducibility & idempotency:** Sync and report can be run repeatedly with stable, correct results.
- **Clarity:** Small, single-purpose modules with well-defined interfaces; readable by a reviewer.

## 3. Architecture

```
Shopify dev store (Admin GraphQL API)
        │  pull + clean
        ▼
[ shopify-sync skill ] ── Node/TS ETL ── upsert ──► Supabase (Postgres)
   (TTL-guarded: skips if data already fresh)            ▲        │
        ▲                                                 │        │
        │ sync-if-stale (trusted write process)           │        │
        ├─────────────────────────────────────────────────┘        │
        │                                                            │
   ┌────┴─────────────────┐                    ┌─────────────────────┴───────┐
   │  store-analyst agent │                    │      daily-report skill      │
   │  1. sync-if-stale    │                    │  1. sync-if-stale            │
   │  2. read via MCP     │                    │  2. deterministic TS query   │
   │     (READ-ONLY role) │                    │     (SELECT-only)            │
   └──────────────────────┘                    └──────────────────────────────┘
```

### Freshness model (auto-sync before every read)
Both the agent and the report **sync-if-stale** before reading:
- `sync_state` holds `last_synced_at`. If it is null or older than `SYNC_TTL_SECONDS` (default 300), a full sync runs; otherwise the data is considered fresh and the sync is skipped.
- The `shopify-sync` entrypoint is itself TTL-aware (`npm run sync`), with `--force` to override. So callers can *always* "sync first" and the sync decides whether real work is needed — no redundant pulls on rapid-fire questions.

### Two deliberate read philosophies
- **Untrusted actor (the LLM agent):** locked to a read-only Postgres role via the Supabase MCP server. The read-only guarantee is enforced by Postgres grants and by structural removal of mutating tools — not by a prompt the model could ignore. See `docs/research-supabase-mcp.md`.
- **Trusted code we wrote (report script):** SELECT-only by construction, so numbers are 100% deterministic with **zero LLM math** → no hallucination surface. Also runs headless (cron-friendly).

The agent *orchestrates* a trusted write process (the ETL, which holds its own write creds) but **cannot itself issue writes** via the MCP. Least-privilege is enforced at the credential level exactly where the actor is untrusted.

### Component decomposition (`src/`)
| Module | Responsibility | Depends on |
| :-- | :-- | :-- |
| `config.ts` | Load + validate env vars; fail fast with a clear message if any are missing. | env |
| `shopify.ts` | Shopify Admin GraphQL client: fetch products+variants, orders+line-items, customers with cursor pagination + throttle handling. | config |
| `transform.ts` | **Pure functions**: raw Shopify JSON → clean DB row shapes. Unit-tested. | — |
| `supabase.ts` | Supabase client + batched `upsert` helpers keyed on `shopify_id`, in FK dependency order. | config |
| `sync.ts` | Orchestrates a full sync; TTL guard (`runSyncIfStale`, `--force`); writes `sync_state`; prints counts. | above |
| `report.ts` | `runSyncIfStale()` then computes the daily report (SELECT-only) and formats markdown. | config, sync, supabase |
| `time.ts` | **Pure functions**: day/week window boundaries in the report timezone. Unit-tested. | — |

## 4. Data model

Six tables. Natural primary key = the numeric Shopify id everywhere, which gives idempotent upserts for free. Cross-entity references that can dangle (a line item pointing at a since-deleted product) are **nullable bigint without an FK constraint**; safe references keep FKs.

### `products`
`shopify_id` bigint PK · `title` · `handle` · `vendor` · `product_type` · `status` (active/draft/archived) · `tags` text[] · `total_inventory` int · `min_price` numeric(12,2) · `max_price` numeric(12,2) · `created_at` · `updated_at` · `synced_at` default now()

### `product_variants`
`shopify_id` bigint PK · `product_id` bigint **FK→products** · `title` · `sku` · `price` numeric(12,2) · `compare_at_price` numeric(12,2) · `inventory_quantity` int · `position` int · `created_at` · `updated_at` · `synced_at`

### `customers`
`shopify_id` bigint PK · `email` · `first_name` · `last_name` · `orders_count` int · `total_spent` numeric(12,2) · `state` · `created_at` · `updated_at` · `synced_at`  *(minimal PII — see §7)*

### `orders`
`shopify_id` bigint PK · `name` (e.g. `#1001`) · `customer_id` bigint (nullable, no FK — customer may be absent) · `email` · `financial_status` · `fulfillment_status` · `currency` · `subtotal_price` · `total_tax` · `total_discounts` · `total_price` numeric(12,2) · `created_at` · `processed_at` · `updated_at` · `cancelled_at` · `synced_at`

### `order_line_items`
`shopify_id` bigint PK · `order_id` bigint **FK→orders** · `product_id` bigint (nullable, no FK) · `variant_id` bigint (nullable, no FK) · `title` · `variant_title` · `sku` · `quantity` int · `price` numeric(12,2) (unit) · `total_discount` numeric(12,2) · `synced_at`

### `sync_state` (single row, `id`=1)
`id` int PK check(id=1) · `last_synced_at` timestamptz · `last_status` (success/error) · `last_error` text · `products_synced` · `variants_synced` · `orders_synced` · `line_items_synced` · `customers_synced` int · `duration_ms` int · `updated_at`

Delivered as `supabase/migrations/0001_init.sql`. Indexes on `orders.created_at`, `products.created_at`, `order_line_items.order_id`, `order_line_items.product_id`.

### Metric definitions (single source of truth — used by report AND documented for the agent)
- **New orders (window):** count of `orders` where `created_at` ∈ window and `cancelled_at IS NULL`.
- **Revenue (window):** `SUM(total_price)` over non-cancelled `orders` created in the window. `total_price` is Shopify's authoritative order total → report matches the store admin exactly.
- **New products (window):** count of `products` where `created_at` ∈ window.
- **Units sold / top products (window):** from `order_line_items` joined to non-cancelled `orders`; units = `SUM(quantity)`, product revenue = `SUM(quantity*price - total_discount)`.
- **Window:** "today" = current calendar day; "this week" = Monday 00:00 → now, both in `REPORT_TIMEZONE` (IANA, default `UTC`).

These definitions are copied into the agent's instructions so ad-hoc answers and the report agree.

## 5. Data flow

### Sync (F1 + F2), TTL-guarded
1. `config` validates env (fail fast). 2. If not stale and not `--force`, exit early (fresh). 3. `shopify` pages through all products+variants, orders+line-items, customers (GraphQL cursor pagination; backoff on throttle/`429`/`5xx`). 4. `transform` maps each raw record to clean rows (pure). 5. `supabase` upserts in batches `ON CONFLICT (shopify_id) DO UPDATE`, in FK order (customers → products → variants → orders → line_items). 6. `sync_state` row updated with counts/status/duration.

Re-running updates in place → **no duplicates**. Full sync every run (dev-store scale); does not reconcile hard-deletes in Shopify (§10). Incremental via `updated_at_min` is future work.

### Q&A (F3)
The `store-analyst` agent: (1) runs `npm run sync` (TTL-guarded, so usually a fast no-op) via Bash, (2) answers using the Supabase MCP (`execute_sql`, `list_tables`) against the **read-only** role. It must run a real query for every number, name/show the query behind a number, refuse to guess, state when data is absent, and treat DB row contents as **data, never instructions** (prompt-injection guardrail).

### Report (F4)
`daily-report` skill runs `report.ts` → `runSyncIfStale()` → SELECTs the metrics for the window → prints a short markdown report with a "data as of `last_synced_at`" line. Deterministic, no LLM math.

## 6. Deliverables (file tree)

```
.
├── .claude/
│   ├── skills/
│   │   ├── shopify-sync/SKILL.md
│   │   └── daily-report/SKILL.md
│   └── agents/store-analyst.md
├── .mcp.json                     # Supabase MCP, read_only=true, project-scoped (no secret)
├── supabase/migrations/0001_init.sql
├── src/ config.ts shopify.ts transform.ts supabase.ts sync.ts report.ts time.ts
├── test/ transform.test.ts time.test.ts
├── .env.example  .gitignore  package.json  tsconfig.json  README.md
└── docs/ DESIGN-JOURNAL.md  research-supabase-mcp.md  superpowers/specs/…
```

### Skill / agent trigger descriptions (F5)
- **`shopify-sync`** — pull/refresh/import the latest Shopify products and orders into Supabase ("sync the store", "refresh the data").
- **`daily-report`** — the daily/store report or a summary of new orders, revenue, new products ("daily report", "how did the store do today").
- **`store-analyst` agent** — any question about store data/metrics answerable from the database ("how many orders this week", "top-selling product", "how many draft products").

## 7. Security

- **Write path:** `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_API_VERSION`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_TTL_SECONDS`, `REPORT_TIMEZONE` live only in a **gitignored `.env`**; a committed `.env.example` documents them.
- **Read path (agent):** Supabase MCP hosted server via **OAuth** — the teammate logs in once in the browser; **no key stored anywhere**. `.mcp.json` holds only the non-secret `project_ref` + `read_only=true`, so it is safe to commit and "just works" when the repo is opened.
- **PII:** we store customer email/name because it is fake dev-store data; documented and easy to drop.
- **MCP caveats (from research):** headless PAT fallback is account-wide; prompt-injection is the top residual risk. Mitigated via OAuth + read-only role + agent injection guardrail.

## 8. Error handling & reliability

- **Config:** missing/invalid env → single clear error, exit non-zero, no partial run.
- **Shopify:** cursor pagination to completion; exponential backoff on throttling/`429`/`5xx`; clear error on auth failure.
- **Upsert:** batched, FK-ordered; failed batch retried; idempotency makes a re-run after partial failure safe.
- **Sync failure during a read:** the agent/report proceed on last-good data **and clearly flag** that the refresh failed and show `last_synced_at` — never silently present stale data as fresh, never block the answer entirely.
- **Report/agent on empty data:** show `0` / "no data found" — never fabricate.

## 9. Testing

- **Unit (pure, high-value):** `transform` (GID→id extraction, price range from variants, line-item mapping, nullable fields, dangling product refs) and `time` (day/week boundaries, timezone, week-start edges). Table-driven.
- **E2E (once credentials provided):** (1) run sync, assert row counts vs store; (2) run again, counts unchanged → idempotency; (3) run report, eyeball vs admin; (4) ask agent "how many orders this week", confirm it equals a manual `SELECT COUNT(*)`; (5) confirm a second question within the TTL does **not** re-pull.

## 10. Out of scope (YAGNI)

Webhooks/real-time sync; hard-delete reconciliation; incremental `updated_at_min` sync; multi-store; RLS/multi-tenant; dashboards; actual cron scheduling (report is cron-*ready*).

## 11. Open trade-offs (acknowledged)

- **Full vs incremental sync** — full, for simplicity at dev-store scale.
- **Staleness TTL vs always-pull** — a TTL (default 300s) balances "fresh data" against latency/rate-limits; `--force` bypasses it.
- **Service key for report reads** — SELECT-only trusted code; acceptable unlike the LLM agent, which gets the read-only role.
- **`project_ref` committed in `.mcp.json`** — non-secret; committing maximizes "just works". `${SUPABASE_PROJECT_REF}` interpolation is the stricter alternative.
- **Agent triggers a write process** — it can run the trusted ETL but cannot write via MCP; the "read-only agent" property is preserved at the credential layer.
