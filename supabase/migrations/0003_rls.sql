-- Security hardening: close the anon/authenticated read exposure flagged by the
-- Supabase advisor.
--
-- Supabase grants privileges to the PostgREST roles (anon, authenticated —
-- reachable with the project's publishable key) on every table in `public` by
-- default, and relies on Row Level Security to actually restrict access. With RLS
-- off, anyone holding the publishable key could read all rows over the auto REST
-- API. We enable RLS with NO policies so those roles are denied entirely.
--
-- This does NOT affect the two legitimate accessors:
--   * the ETL / report path connects as `postgres` (table owner, superuser) → bypasses RLS;
--   * the MCP agent connects as `supabase_read_only_user`, which has BYPASSRLS and
--     pg_read_all_data → still reads everything.
--
-- All statements are idempotent (safe to re-run by the migrate runner).

alter table products          enable row level security;
alter table product_variants  enable row level security;
alter table customers         enable row level security;
alter table orders            enable row level security;
alter table order_line_items  enable row level security;
alter table sync_state        enable row level security;
alter table app_config        enable row level security;

-- Views run with their owner's privileges by default, which would let anon read
-- table data *through* a view even with table RLS on. security_invoker makes each
-- view execute as the querying role, so RLS applies to anon/authenticated too
-- (while the BYPASSRLS read-only role still reads freely).
alter view orders_valid    set (security_invoker = true);
alter view daily_metrics   set (security_invoker = true);
alter view weekly_metrics  set (security_invoker = true);

-- Defense in depth: drop the broad default privileges Supabase grants to the
-- PostgREST roles. The legitimate readers do not depend on these.
revoke all on all tables in schema public from anon, authenticated;
