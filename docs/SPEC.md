# Shopify → Supabase Store Assistant — Design

- **Date:** 2026-07-11
- **Status:** Approved (design), revised — hardened after adversarial review (`docs/design-review-grill.md`)

> A running narrative of *why* each choice was made lives in `docs/DESIGN-JOURNAL.md` (for the interviewer). This spec is the *what*. The adversarial grilling that shaped this revision is in `docs/design-review-grill.md`.

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
| `shopify.ts` | Shopify Admin GraphQL client: fetch products+variants, orders+line-items, customers with cursor pagination + cost/throttle-aware backoff; captures shop currency. | config |
| `transform.ts` | **Pure functions**: raw Shopify JSON → clean DB row shapes (incl. `shopMoney` amounts, refunds, `test` flag). Unit-tested. | — |
| `supabase.ts` | Supabase client + batched, per-entity-transactional `upsert` helpers keyed on `shopify_id`, in FK dependency order; advisory-lock helper. | config |
| `sync.ts` | Orchestrates a full sync; advisory lock + TTL guard (`runSyncIfStale`, `--force`); writes `sync_state`/`app_config`; prints counts. | above |
| `report.ts` | `runSyncIfStale()` then SELECTs the `*_metrics` views (SELECT-only) and formats markdown. | config, sync, supabase |
| `time.ts` | **Pure functions**: small helpers to format the "as of"/window *labels* for display. Window *math* lives in SQL (`store_*_range()`), not here. Unit-tested. | — |

## 4. Data model

Six tables. Natural primary key = the numeric Shopify id everywhere, which gives idempotent upserts for free. Cross-entity references that can dangle (a line item pointing at a since-deleted product) are **nullable bigint without an FK constraint**; safe references keep FKs.

### `products`
`shopify_id` bigint PK · `title` · `handle` · `vendor` · `product_type` · `status` (active/draft/archived) · `tags` text[] · `total_inventory` int · `min_price` numeric(12,2) · `max_price` numeric(12,2) · `created_at` · `updated_at` · `synced_at` default now()

### `product_variants`
`shopify_id` bigint PK · `product_id` bigint **FK→products** · `title` · `sku` · `price` numeric(12,2) · `compare_at_price` numeric(12,2) · `inventory_quantity` int · `position` int · `created_at` · `updated_at` · `synced_at`

### `customers`
`shopify_id` bigint PK · `email` · `first_name` · `last_name` · `orders_count` int · `total_spent` numeric(12,2) · `state` · `created_at` · `updated_at` · `synced_at`  *(minimal PII — see §7)*

### `orders`
`shopify_id` bigint PK · `name` (e.g. `#1001`) · `customer_id` bigint (nullable, no FK — customer may be absent) · `email` · `financial_status` · `fulfillment_status` · `currency` (shop currency, see below) · `test` boolean · `subtotal_price` · `total_tax` · `total_discounts` · `total_refunded` numeric(12,2) · `total_price` numeric(12,2) · `created_at` · `processed_at` · `updated_at` · `cancelled_at` · `synced_at`

All money is stored in **shop currency** (`shopMoney`), never presentment currency, so amounts are directly comparable and summable. `total_refunded` and `test` exist so revenue can net refunds and exclude test orders (see the metric layer below).

### `order_line_items`
`shopify_id` bigint PK · `order_id` bigint **FK→orders** · `product_id` bigint (nullable, no FK) · `variant_id` bigint (nullable, no FK) · `title` · `variant_title` · `sku` · `quantity` int · `price` numeric(12,2) (unit) · `total_discount` numeric(12,2) · `synced_at`

### `sync_state` (single row, `id`=1)
`id` int PK check(id=1) · `last_synced_at` timestamptz · `last_status` (success/error) · `last_error` text · `products_synced` · `variants_synced` · `orders_synced` · `line_items_synced` · `customers_synced` int · `duration_ms` int · `updated_at`

### `app_config` (single row, `id`=1)
`id` int PK check(id=1) · `report_timezone` text default `'UTC'` (IANA, seeded from the `REPORT_TIMEZONE` env on sync) · `store_currency` text — the shop's currency, captured from Shopify on sync. Read by the metric layer so window and currency logic have one authoritative source instead of being re-derived per caller.

Delivered as `supabase/migrations/0001_init.sql`. Indexes on `orders.created_at`, `products.created_at`, `order_line_items.order_id`, `order_line_items.product_id`.

### Metric layer — SQL views/functions are the single source of truth
The metric definitions live **in the database** as views and functions (migration `0002_metrics.sql`), not in a prompt. Both the deterministic report *and* the LLM agent query these same objects, so a metric cannot drift between the two paths. This is the central fix from the adversarial review: provenance was already hard-enforced (the agent can't invent a number), and now **semantic correctness is hard-enforced too** (the agent can't silently answer a *different* question with a different window/currency/refund treatment).

- **`store_today_range()` / `store_week_range()`** — SQL functions returning a `tstzrange` for "today" (current calendar day) and "this week" (Monday 00:00 → now), both computed in `app_config.report_timezone`. The agent uses these instead of writing its own `now() - interval '7 days'`, which would drift.
- **`orders_valid`** — the canonical order set: excludes `cancelled_at IS NOT NULL` and `test = true`; exposes `net_revenue = total_price - total_refunded`. **Revenue = `SUM(net_revenue)`** over this view, so a fully/partially refunded order is netted and the number matches the Shopify admin.
- **`daily_metrics` / `weekly_metrics`** — views returning `new_orders`, `revenue` (net), `new_products`, `units_sold` for the corresponding window. The report selects these directly.
- **Units sold / top products** — from `order_line_items` joined to `orders_valid`; units = `SUM(quantity)`, product revenue = `SUM(quantity*price - total_discount)`.
- **Single currency assertion** — the sync fails (or warns loudly) if it encounters orders in more than one currency, because `SUM` across currencies is meaningless. The report labels every money figure with `app_config.store_currency`.

The agent's instructions tell it to **prefer these views/functions** for any windowed or revenue question, and to **do all arithmetic in SQL** (no client-side deltas/percentages) so every number it utters came verbatim from a query result.

## 5. Data flow

### Sync (F1 + F2), TTL-guarded and serialized
1. `config` validates env (fail fast). 2. Acquire a Postgres **advisory lock** (`pg_advisory_lock`) so two callers (e.g. the agent and a report firing together) cannot sync concurrently; the second waits, then sees fresh data and no-ops. 3. Re-check staleness *under the lock* (guards the check-then-act race): if not stale and not `--force`, release and exit early (fresh). 4. `shopify` pages through all products+variants, orders+line-items, customers (GraphQL cursor pagination; backoff driven by the GraphQL **cost/throttle status**, falling back to `429`/`Retry-After`). 5. `transform` maps each raw record to clean rows (pure); the shop currency is captured into `app_config`. 6. `supabase` upserts in batches `ON CONFLICT (shopify_id) DO UPDATE`, in FK order (customers → products → variants → orders → line_items), **inside a transaction per entity** so a failed batch does not leave torn rows. 7. Only on full success is `sync_state.last_synced_at` stamped; on failure `last_status='error'` + `last_error` are recorded but `last_synced_at` is left untouched so readers still see honest staleness.

Re-running updates in place → **no duplicates**. Full sync every run (dev-store scale); does not reconcile hard-deletes in Shopify (§11). Incremental via `updated_at_min` is future work.

**Order history scope:** the Shopify Admin API only returns orders from the last 60 days unless the app is granted `read_all_orders`. The sync requests it; the setup docs call it out, and if it is not granted the report/agent label the order window as **"last 60 days"** rather than silently truncating history.

### Q&A (F3)
The `store-analyst` agent: (1) refreshes data by running the sync — its Bash is **allow-listed to exactly `npm run sync` (± `--force`)** and nothing else, so "orchestrates a trusted write process" cannot become "runs arbitrary writes with the service key"; (2) answers using the Supabase MCP (`execute_sql`, `list_tables`) against the **read-only** role. For any windowed or revenue question it **must use the metric views/functions** (`store_week_range()`, `orders_valid`, `weekly_metrics`, …) rather than hand-rolling windows, and **must do all arithmetic in SQL**. It runs a real query for every number, names/shows the query behind a number, refuses to guess, states when data is absent, and treats DB row contents as **data, never instructions** (prompt-injection guardrail).

### Report (F4)
`daily-report` skill runs `report.ts` → `runSyncIfStale()` → SELECTs `daily_metrics`/`weekly_metrics` (the same views the agent uses) → prints a short markdown report, every money figure labelled with `store_currency`, plus a "data as of `last_synced_at`" line. Deterministic, no LLM math.

## 6. Deliverables (file tree)

```
.
├── .claude/
│   ├── skills/
│   │   ├── shopify-sync/SKILL.md
│   │   └── daily-report/SKILL.md
│   └── agents/store-analyst.md
├── .mcp.json                     # Supabase MCP, read_only=true, project-scoped (no secret)
├── supabase/migrations/0001_init.sql        # tables
├── supabase/migrations/0002_metrics.sql     # app_config + metric views/functions
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
- **Agent Bash is allow-listed** to exactly `npm run sync` (± `--force`). Combined with the read-only MCP role, the agent genuinely cannot write to the DB — it can only *trigger* the reviewed ETL. This closes the "read-only agent secretly holds a write path" hole raised in review.
- **Shopify scopes:** the custom app requests `read_products`, `read_orders`, `read_all_orders` (for >60-day history), `read_customers`. Documented in `.env.example`/README so setup is explicit.
- **Row Level Security:** RLS is enabled (no policies) on every table and the metric views are `security_invoker` (`0003_rls.sql`), so the PostgREST roles (`anon`/`authenticated`, reachable via the publishable key) are denied all access. The only readers are the ETL/report (owner `postgres`) and the agent (`supabase_read_only_user`, which has `pg_read_all_data` + `BYPASSRLS`). Verified: `anon` is hard-denied, the agent still returns identical numbers.
- **PII:** dev/free Shopify plans deny the Customer object's PII outright, so the pipeline stores no customer email/names and no order email — it is PII-free in practice (columns remain, always `NULL`).
- **MCP caveats (from research):** headless PAT fallback is account-wide; prompt-injection is the top residual risk. Mitigated via OAuth + read-only role + agent injection guardrail.

## 8. Error handling & reliability

- **Config:** missing/invalid env → single clear error, exit non-zero, no partial run.
- **Shopify:** cursor pagination to completion; cost/throttle-aware backoff (falls back to `429`/`Retry-After`/`5xx`); clear error on auth/scope failure. If `read_all_orders` is absent, history is labelled "last 60 days" rather than silently truncated.
- **Currency:** if more than one order currency is seen, the sync fails/warns loudly rather than summing incomparable money.
- **Upsert:** batched, FK-ordered, per-entity transactional; failed batch retried; idempotency makes a re-run after partial failure safe; `last_synced_at` is stamped only on full success.
- **Sync failure during a read:** the agent/report proceed on last-good data **and clearly flag** that the refresh failed and show `last_synced_at` — never silently present stale data as fresh, never block the answer entirely.
- **Report/agent on empty data:** show `0` / "no data found" — never fabricate. Distinguish `0` from `NULL` (empty aggregate) explicitly.
- **Non-technical error surfacing:** failures print a short plain-language line ("Couldn't reach Shopify — check the token in .env") plus the technical detail, so a non-technical teammate knows what to do.

## 9. Testing

- **Unit (pure, high-value):** `transform` (GID→id extraction, price range from variants, line-item mapping, `shopMoney`/refund/`test` handling, nullable fields, dangling product refs) and `time` label helpers. Table-driven.
- **Metric-layer tests (against a test DB):** seed known rows and assert `orders_valid` nets refunds and drops test/cancelled orders, and that `store_week_range()`/`weekly_metrics` land on the right Monday-anchored, timezone-correct window (incl. a Sunday-night boundary case). This is where the "no wrong-window" guarantee is actually verified.
- **E2E (once credentials provided):** (1) run sync, assert row counts vs store; (2) run again, counts unchanged → idempotency; (3) run report, reconcile revenue vs admin **including a refunded order**; (4) ask agent "how many orders this week" and confirm it equals the `weekly_metrics` view / a manual count; (5) confirm a second question within the TTL does **not** re-pull.

## 10. Out of scope (YAGNI)

Webhooks/real-time sync; incremental `updated_at_min` sync; multi-store; RLS/multi-tenant; dashboards; actual cron scheduling (report is cron-*ready*).

## 11. Open trade-offs & deferred hardening (acknowledged)

Applied from the adversarial review (`docs/design-review-grill.md`): metric views/functions as single source of truth, refund-netting + test-order exclusion, single-currency assertion, `shopMoney`, agent Bash allow-list, advisory-lock + transactional sync, `read_all_orders` scope + 60-day labelling, "all math in SQL" for the agent.

**Deferred as documented limitations (safe at dev-store scale):**
- **Hard-delete reconciliation (orphan rows).** An order/product deleted in Shopify lingers in Supabase and would still be counted. Deferred; the clean fix is a mark-and-sweep (stamp a `seen` marker each full sync, soft-delete rows not seen). Called out so a demo isn't surprised.
- ~~**PII-free agent view.**~~ **Resolved during the live run:** the dev-store plan denies customer PII at the source (so nothing sensitive is stored), and RLS + `security_invoker` views (`0003_rls.sql`) deny the `anon`/`authenticated` REST roles entirely. The exposure this item worried about is closed.
- **Nested pagination > 250.** A single product with >250 variants or a single order with >250 line items is not sub-paginated. Deferred — unreachable at dev-store scale; noted so it isn't mistaken for handled.

**Trade-offs we keep:**
- **Full vs incremental sync** — full, for simplicity at dev-store scale.
- **Staleness TTL vs always-pull** — a TTL (default 300s) balances "fresh data" against latency/rate-limits; `--force` bypasses it.
- **Service key for report reads** — SELECT-only trusted code; acceptable unlike the LLM agent, which gets the read-only role. (A dedicated read-only key would be stricter.)
- **`project_ref` committed in `.mcp.json`** — non-secret; committing maximizes "just works". `${SUPABASE_PROJECT_REF}` interpolation is the stricter alternative.
- **Agent triggers a write process** — it can run *only* the allow-listed trusted ETL and cannot write via MCP; the "read-only agent" property is preserved at the credential layer.
