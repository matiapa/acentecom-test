# Implementation progress — Tasks 7–12 (data layer)

Plan: `docs/superpowers/plans/2026-07-13-shopify-supabase-assistant.md`
Scope: Tasks 7 through 12 only. Tasks 1–6 already on `main` (types, config, transform, time — 14 unit tests green).

Baseline confirmed before starting: `npm run typecheck` clean, `npm test` → 5 files / 14 tests passed.

---

## Task 7: DB schema + metric-layer migrations

Status: DONE
Files created:
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_metrics.sql`
- `src/db/pool.ts`
- `src/db/migrate.ts`
- `src/cli/migrate.ts`

No unit test for this task per plan (SQL correctness verified against real DB in Task 17, out of scope). Verification: `npm run typecheck` clean; `npm test` → 5 files / 14 tests still passing (unchanged from baseline).
Shopify-doc corrections: none (no Shopify fields touched in this task).
Commit: 4f24dbe — "feat: add schema + metric-layer migrations and migrate runner"

---

## Task 8: Shopify GraphQL client

Status: DONE
Doc verification performed via context7 MCP (`/websites/shopify_dev_api_admin-graphql_2026-01`) and WebFetch of shopify.dev/docs/api/admin-graphql.

Findings:
- **Current stable API version is `2026-07`**, not the plan's placeholder `2025-10`. Corrected `SHOPIFY_API_VERSION` in `.env.example` (both the value and the inline comment) to `2026-07`.
- All other fields checked out against docs, no changes needed to `queries.ts` or `transform.ts`:
  - `ProductPriceRangeV2.minVariantPrice`/`maxVariantPrice` (MoneyV2 with `.amount`) — matches.
  - `ProductVariant.price` / `compareAtPrice` are scalar `Money` type — matches plan's assumption (defensive `String(...)` wrap in transform.ts kept as-is, still correct/harmless).
  - `Order.totalRefundedSet`, `totalDiscountsSet`, `totalTaxSet`, `totalPriceSet`, `currentSubtotalPriceSet` all confirmed to exist, of type `MoneyBag` with `shopMoney`/`presentmentMoney` (each `MoneyV2` with `.amount`/`.currencyCode`) — matches `shopMoney()` helper in transform.ts.
  - `Order.test` (Boolean!), `Order.displayFinancialStatus`/`displayFulfillmentStatus` — confirmed, matches.
  - `LineItem.originalUnitPriceSet`, `totalDiscountSet`, `variantTitle` — confirmed, matches.
  - `Customer.numberOfOrders` (UnsignedInt64!, serialized as string) and `amountSpent` (MoneyV2!) — confirmed, matches `Number.parseInt(String(...))` handling in transform.ts.
  - `Shop.currencyCode`/`ianaTimezone` and the `errors[].extensions.code === "THROTTLED"` throttle-detection shape are standard, well-documented Shopify fields; not directly contradicted by anything found, left as planned.

Files created:
- `src/shopify/client.ts`
- `src/shopify/queries.ts`
- `test/shopify-client.test.ts`
Files modified:
- `.env.example` (SHOPIFY_API_VERSION 2025-10 → 2026-07)

Test result: `npm test -- shopify-client` → 2/2 passed (throttle retry, pagination). Full suite: 6 files / 16 tests passed. `npm run typecheck` clean.
Commit: 5ad34cb — "feat: add throttle-aware paginating Shopify GraphQL client"

---

## Task 9: Shopify fetchers

Status: DONE
Files created:
- `src/shopify/fetchers.ts`
- `test/fetchers.test.ts`

Test result: `npm test -- fetchers` → 1/1 passed. Full suite: 7 files / 17 tests passed. `npm run typecheck` clean.
Shopify-doc corrections: none (reuses fields already verified in Task 8).
Commit: 291afe6 — "feat: assemble Shopify SyncData from paginated fetchers"

---

## Task 10: Transactional upsert with advisory lock

Status: DONE
Files created:
- `src/db/upsert.ts`
- `test/upsert.int.test.ts` (deviates slightly from plan's literal code — see below)

**Deviation from plan (bug fix, required by task's "skip cleanly" constraint):** The plan's
literal test code calls `const pool = getPool(loadConfig());` directly in the `describe.skipIf(...)`
body. Empirically verified (vitest 2.1.9): `describe.skipIf` still executes the describe factory
body during collection even when the condition means the suite is skipped — only `test()`/
`beforeAll()`/`afterAll()` bodies are actually skipped. So the literal plan code THROWS
(`Missing required environment variable(s)...`) instead of skipping cleanly, when run without
`SUPABASE_DB_URL`. Fixed by declaring `let pool: pg.Pool;` and moving `getPool(loadConfig())`
into `beforeAll`, which vitest does correctly skip. Verified: without DB, suite now shows
`↓ test/upsert.int.test.ts (1 test | 1 skipped)` — clean skip, no throw. This same fix pattern
will be needed for Tasks 11 and 12's integration tests (same `describe.skipIf` + top-level
`getPool(loadConfig())` pattern in the plan).

Test result: `npm test -- upsert` → 1 test skipped (clean). Full suite: 7 files/17 tests passed + 1 file/1 test skipped. `npm run typecheck` clean.
Shopify-doc corrections: none (no Shopify fields in this task).
Commit: b368079 — "feat: add transactional, FK-ordered upsert with advisory lock"

---

## Task 11: Sync orchestration

Status: DONE
Files created:
- `src/sync.ts`
- `src/cli/sync.ts`
- `test/sync.int.test.ts` (same `beforeAll`-deferred-pool fix as Task 10, applied proactively)

Test result: `npm test -- sync` → 1 test skipped (clean). Full suite: 7 files/17 tests passed + 2 files/2 tests skipped. `npm run typecheck` clean.
Shopify-doc corrections: none (no new Shopify fields in this task).
Commit: bb38529 — "feat: add TTL-guarded sync with currency assertion and sync_state"

---

## Task 12: Metrics reader + daily report

Status: DONE
Files created:
- `src/db/metrics.ts`
- `src/report.ts`
- `src/cli/report.ts`
- `test/report.test.ts` (pure unit test — 2 tests)
- `test/metrics.int.test.ts` (same `beforeAll`-deferred-pool fix as Tasks 10/11, applied proactively)

Test result: `npm test -- report metrics` → report: 2/2 unit tests passed; metrics: 1 test skipped (clean). `npm run typecheck` clean.
Shopify-doc corrections: none (no Shopify fields in this task; pure SQL/report formatting).
Commit: cfd73e2 — "feat: add metrics reader and deterministic daily report"

---

## FINAL SUMMARY (Tasks 7–12)

All six tasks complete on `main`. Final full-suite run: **8 test files / 19 tests passed, 3 files / 3 tests skipped** (upsert.int, sync.int, metrics.int — all skip cleanly via `describe.skipIf(!process.env.SUPABASE_DB_URL)`, no DB creds available in this environment). `npm run typecheck` clean throughout.

**Shopify API/field corrections vs plan (Task 8):**
- `SHOPIFY_API_VERSION` corrected from placeholder `2025-10` to the confirmed current stable `2026-07` in `.env.example`.
- No field names required correction — `priceRangeV2`, `ProductVariant.price`/`compareAtPrice` (scalar `Money`), `Order.totalRefundedSet`/`totalDiscountsSet`/`totalTaxSet`/`totalPriceSet`/`currentSubtotalPriceSet` (all `MoneyBag` → `shopMoney.amount`), `test`, `displayFinancialStatus`/`displayFulfillmentStatus`, `LineItem.originalUnitPriceSet`/`totalDiscountSet`/`variantTitle`, `Customer.numberOfOrders`/`amountSpent` all verified as-is against shopify.dev docs (2026-01 indexed docs + live shopify.dev page confirming 2026-07 as current). `queries.ts` and `transform.ts` unchanged from the plan.

**Deviation from plan (test-code bug fix, Tasks 10/11/12 integration tests):**
The plan's literal `*.int.test.ts` code calls `const pool = getPool(loadConfig());` directly inside the `describe.skipIf(!hasDb)(...)` body. Verified empirically (vitest 2.1.9) that `describe.skipIf` still executes the describe factory body during collection even when the whole suite is skipped — only `test()`/`beforeAll()`/`afterAll()` are actually skipped. The literal plan code therefore THROWS on missing env vars instead of skipping cleanly, violating the "must skip cleanly" requirement. Fixed in all three integration test files by declaring `let pool: pg.Pool;` and moving `getPool(loadConfig())` into `beforeAll`. Verified clean skip (`↓ ... (1 test | 1 skipped)`, no throw) for all three files, both individually and in the full suite run. No other code deviates from the plan.

Commits (chronological): 4f24dbe, 5ad34cb, 291afe6, b368079, bb38529, cfd73e2.

