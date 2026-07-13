# Design Journal — Shopify → Supabase Store Assistant

A narrative of the design *process*: the challenges we hit, the options we weighed, and why we chose what we chose. It complements the formal spec (`docs/superpowers/specs/2026-07-11-shopify-supabase-assistant-design.md`), which describes the final *what*. This document is the *why*, kept for the interview walkthrough.

Entries are chronological. Newest decisions are appended at the bottom.

---

## 1. Reading the assignment

The task is not a single function — it is a small **system** delivered as **Claude Code skills and agents** that runs the full path: pull Shopify data → clean → store in Supabase → answer questions → daily report. The evaluation weights three things heavily: (a) the services work as **one connected flow**, (b) **no hallucinated numbers**, (c) it is **finished, not almost**. So the design optimizes for a demonstrable end-to-end loop and for guarantees around where numbers come from, rather than for breadth of features.

We deferred all credential setup — the design is built to be credential-agnostic and only needs env values plugged in later.

## 2. Language / runtime — Node.js + TypeScript

Considered Python (very concise for ETL) vs Node/TS. Chose **Node/TS** at the user's direction. Trade-off accepted: slightly more ceremony than Python, but first-class Shopify/Supabase SDKs, typed row models that make the "clean shape" explicit, and a natural fit for pure, unit-testable transform functions.

## 3. The central question — how does the Q&A agent read data without hallucinating?

This is the crux of the assignment ("never invent numbers"). Three options:

- **A. Read-only SQL runner CLI** — a tool the agent calls that runs its SELECTs against a read-only role.
- **B. Predefined query library** — fixed parameterized functions; very safe but only answers anticipated questions.
- **C. Supabase MCP server** — give the agent DB tools directly.

The user's steer: *prefer the Supabase MCP if — and only if — read-only can be genuinely enforced* (because an MCP pinned to the repo auto-sets-up for a non-technical teammate). If enforcement were only cosmetic, fall back to a CLI with an easy setup script.

**So we researched it before committing** (Sonnet subagent, findings in `docs/research-supabase-mcp.md`).

### Finding: read-only is genuinely enforced, not cosmetic
Two real layers: (1) mutating tools (`apply_migration`, `create_*`, …) are **structurally removed** from the tool list when `read_only=true`; (2) the surviving `execute_sql` connects as a dedicated **`supabase_read_only_user` Postgres role**, so writes are rejected by Postgres grants — not by a prompt the model could choose to ignore. The current server is **hosted + OAuth**, which is even better for a non-technical teammate: the read path has **no secret to store** — they log in once in the browser.

**Decision:** the Q&A agent reads via the Supabase MCP with `read_only=true` + `project_ref` scoping. The CLI fallback is not needed.

### Challenge surfaced by the research
- The underlying Personal Access Token (only for headless/CI) is **account-wide** — a leaked token isn't limited to one project. We avoid it by preferring OAuth for the interactive agent.
- Supabase itself calls **prompt-injection the #1 residual risk**: malicious text sitting in your own DB rows can hijack an agent when read back into context. Mitigation → an explicit guardrail in the agent: treat all DB row content as *data, never instructions*.

## 4. Two deliberate read philosophies

Rather than force one read path, we split by **who the actor is**:
- The **LLM agent is untrusted** → it gets the DB-enforced read-only role via MCP. It physically cannot write, even if instructed to.
- The **report is code we wrote and reviewed** → it is SELECT-only *by construction*, so it can hold the (trusted) service key and do deterministic math with **zero LLM involvement** → no hallucination surface at all, and it runs headless.

This is a nice, defensible principle: enforce least-privilege at the credential layer exactly where the actor is untrusted; trust reviewed code to behave.

## 5. Daily report — deterministic script, not an agent

Because "no hallucinated numbers" is graded, the report computes its numbers in a **deterministic TS query script** (SELECT-only), not by asking the LLM to add things up. Benefits: exact/reproducible, matches the store admin, cron-ready. The trade-off (a second read path using the service key) is acceptable precisely because it is trusted code.

## 6. Data model — reversed to a complete commerce model

Initially we scoped to `products` + `orders` only (matches the explicit requirements: order counts, revenue, new products). **The user then reverted this: the model MUST include line items, as complete as possible.**

Rationale for the reversal: the Q&A agent is open-ended, and line items unlock the questions a real store owner actually asks — *top-selling product, units sold, revenue by product*. "As complete as possible" led us to a full model: `products` + `product_variants` + `orders` + `order_line_items` + `customers`.

Design challenges this introduced, and how we handled them:
- **Dangling references:** a line item can point at a product/variant that was later deleted in Shopify while the historical order persists. So `order_line_items.product_id` / `variant_id` are **nullable bigint without an FK constraint**; only safe references (variant→product, line_item→order) keep FKs.
- **Upsert ordering:** writes go in FK-dependency order (customers → products → variants → orders → line_items) so referential integrity holds within a run.
- **More PII:** the `customers` table adds email/name. Acceptable because it is fake dev-store data; documented and easy to drop.

## 7. Always-fresh data — auto-sync before every read

The user required that the agent and the report **always work on fresh data** — sync before answering or reporting.

Naive "sync on every question" is slow and hammers Shopify's rate limits. So we added a **staleness guard**: a `sync_state` table records `last_synced_at`; a sync only actually pulls if data is older than `SYNC_TTL_SECONDS` (default 300) or `--force` is passed. The `shopify-sync` entrypoint is itself TTL-aware, so callers can *always* "sync first" and the sync decides whether real work is needed. Rapid-fire questions don't each trigger a full pull.

Subtlety worth calling out at the interview: the read-only agent now **orchestrates a write** (it runs the ETL before querying). Doesn't this break the "read-only agent" story? No — the write happens in a **separate trusted process with its own write creds**; the agent still cannot issue arbitrary writes through the MCP. The read-only guarantee lives at the credential layer, and it holds. And if that refresh fails, the read proceeds on last-good data but **clearly flags** the staleness with `last_synced_at` — we never present stale data as fresh, and never block the answer entirely.

## 8. Security model (summary)

- **Write path** secrets (Shopify token, Supabase service key) → gitignored `.env`, with a committed `.env.example` template.
- **Read path** → OAuth via the hosted MCP → **no key stored**. `.mcp.json` carries only the non-secret `project_ref` + `read_only=true`, so it is safe to commit and gives the "just works when you open the repo" experience for a non-technical teammate.

## 9. Open questions to revisit with the interviewer

- Whether to keep customer PII or store only anonymized ids.
- Whether to add incremental (`updated_at_min`) sync and hard-delete reconciliation for a larger catalog.
- Whether the report should eventually be wired to a real schedule (it is cron-ready but not scheduled here).

## 10. Adversarial self-review — grilling the design before writing code

Before implementation we ran a deliberately hostile design review (an Opus subagent playing a demanding technical interviewer; full transcript in `docs/design-review-grill.md`). It posed **33 challenges** and surfaced **14 real gaps**. The single most important finding reframed the whole "no hallucinated numbers" claim:

> **Provenance was hard-enforced, but semantic correctness was only soft-enforced.** The agent physically cannot invent a number (read-only role), but it *could* return a real number that answers the *wrong question* — e.g. a rolling-7-day UTC "this week" instead of the report's Monday-anchored, timezone-aware week, or revenue that ignores refunds. A number can be truthfully queried and still be wrong.

The recurring anti-pattern the review caught: **soft (prompt-level) guarantees dressed up as hard (schema/credential-level) ones** — window definitions "copied into the agent's instructions," the injection guardrail, and the read-only-agent story (which leaked because the agent had general Bash and thus the ETL's write path).

### What we changed (recommended triage applied)
- **Metric layer moved into the database.** Windows and revenue are now SQL **views/functions** (`store_week_range()`, `orders_valid`, `weekly_metrics`, …) that *both* the report and the agent query. Semantic correctness becomes hard-enforced — the agent can't drift to a different window/currency. This one move closed four gaps at once.
- **Revenue nets refunds and excludes test/cancelled orders**, so it reconciles with the Shopify admin (added `total_refunded`, `test`).
- **Single-currency assertion** + storing `shopMoney` — no more summing incomparable money.
- **Agent Bash allow-listed to exactly `npm run sync`** — the "read-only agent" claim is now actually true; it can trigger the trusted ETL but nothing else.
- **Sync serialized + transactional** — advisory lock kills the check-then-act freshness race; `last_synced_at` is stamped only on success, so a partial failure can't masquerade as fresh.
- **`read_all_orders` scope** documented; if absent, history is labelled "last 60 days" instead of silently truncated.

### What we consciously deferred (documented, not forgotten)
Hard-delete/orphan-row reconciliation (mark-and-sweep), a PII-free agent view, and >250 nested pagination — all safe to skip at dev-store scale, all written down in spec §11 so a demo isn't caught off guard.

The lesson worth saying out loud in the interview: **the design was structurally sound, but its guarantees were being asserted a layer higher than they were enforced.** The fix wasn't more features — it was pushing each guarantee down to where it's mechanically true.

## 11. Bringing it live — what the real store taught us

Wiring the code to a real dev store surfaced three things the design docs couldn't, each with a clean resolution:

- **Shopify gates customer PII on dev/free plans.** The Customer object (and `order.email`) returns `ACCESS_DENIED` unless the store is on a paid plan. Rather than fight it, we dropped the PII fields from the queries and made customer sync non-fatal (skip if the whole object is denied). The upside: the pipeline is now **genuinely PII-free** — the exact hardening we'd deferred in spec §11 arrived for free, enforced by Shopify itself.
- **Sample-data generators create *draft* orders, not orders.** With only drafts present, `ordersCount` was 0 and the sync correctly stored **zero revenue**. This is the "no hallucinated numbers" principle proving itself in the wild: a draft is an unpaid quote, so the system refused to invent revenue from it. Real orders (drafts marked as paid) flowed in immediately after. Worth demoing as a feature, not apologising for as a gap.
- **Integration tests must never run against the production DB by default.** The metric test does `delete from orders` to seed known fixtures; under vitest's *parallel* runner the three DB suites raced and — pointed at the real `SUPABASE_DB_URL` — would wipe live data on a plain `npm test`. Fixed by gating the destructive suites behind `RUN_DB_TESTS=1` and a serial `npm run test:db`; `npm test` is now the safe, non-destructive unit suite. A reminder that "it passed once" hid both a **concurrency race** and a **blast-radius** problem.

Final verified state (against the live store): 17 products, 26 variants, 5 paid orders, 7 line items sync idempotently (re-run leaves counts flat); the report reconciles to `$8450.34`; the `supabase_read_only_user` role can read every metric view and execute the window functions, so the read-only agent path is grant-ready.
