# Shopify → Supabase Store Assistant

Pull Shopify data into Supabase and ask questions / get a daily report — as Claude Code
skills and an agent. No numbers are ever invented; every figure comes from SQL.

## What you need (all free)
- A Shopify **development store** with a **custom app** (Admin API access token).
- A **Supabase** project (free tier).
- Node.js 20+.

## One-time setup
1. **Install:** `npm install`
2. **Shopify token:** In your dev store admin → Settings → Apps and sales channels →
   Develop apps → create an app → Admin API scopes: `read_products`, `read_orders`,
   `read_all_orders`, `read_customers` → Install → copy the **Admin API access token**.
3. **Supabase:** create a project. Get the **connection string** (Project Settings →
   Database → Connection string → URI) and your **project ref** (the subdomain of the
   project URL).
4. **Secrets:** `cp .env.example .env` and fill in every value. `.env` is gitignored —
   never commit it.
5. **Create tables:** `npm run migrate`

## Daily use
- **Sync data:** `npm run sync` (or ask Claude to "sync the store"). Re-running updates
  in place — it never duplicates.
- **Daily report:** `npm run report` (or ask for the "daily report").
- **Ask questions:** ask Claude Code, e.g. "how many orders this week?" — the
  **store-analyst** agent answers from the database. First use pops a one-time Supabase
  **OAuth login** in your browser (the read path stores no key).

## How the pieces fit
- `npm run sync` → Shopify Admin GraphQL → clean → upsert into Supabase (idempotent).
- Metric definitions live as SQL views/functions, so the report and the agent share one
  source of truth and can't disagree.
- The agent reads through the Supabase MCP on a **read-only** database role; it can
  trigger a refresh but cannot write.

## Security
Secrets live only in `.env` (gitignored). `.mcp.json` holds only the non-secret project
ref + `read_only=true`. The agent's shell is limited to the sync command.

## Known limitations
See `docs/superpowers/specs/2026-07-11-shopify-supabase-assistant-design.md` §11 (hard-delete
reconciliation, PII-free view, >250 nested pagination — all safe at dev-store scale).
