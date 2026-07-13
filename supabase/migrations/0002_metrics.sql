create table if not exists app_config (
  id              integer primary key check (id = 1),
  report_timezone text not null default 'UTC',
  store_currency  text
);
insert into app_config (id) values (1) on conflict (id) do nothing;

-- Window functions: computed in the configured timezone, returned as UTC tstzrange.
create or replace function store_today_range() returns tstzrange language sql stable as $$
  select tstzrange(
    (date_trunc('day', now() at time zone c.report_timezone)) at time zone c.report_timezone,
    now(), '[)')
  from app_config c where c.id = 1;
$$;

create or replace function store_week_range() returns tstzrange language sql stable as $$
  select tstzrange(
    (date_trunc('week', now() at time zone c.report_timezone)) at time zone c.report_timezone,
    now(), '[)')
  from app_config c where c.id = 1;
$$;

-- Canonical valid-order set: excludes cancelled and test orders; nets refunds.
create or replace view orders_valid as
  select o.*, (coalesce(o.total_price,0) - coalesce(o.total_refunded,0)) as net_revenue
  from orders o
  where o.cancelled_at is null and o.test = false;

create or replace view daily_metrics as
  select
    (select count(*) from orders_valid where created_at <@ store_today_range()) as new_orders,
    (select coalesce(sum(net_revenue),0) from orders_valid where created_at <@ store_today_range()) as revenue,
    (select count(*) from products where created_at <@ store_today_range()) as new_products,
    (select coalesce(sum(li.quantity),0) from order_line_items li
       join orders_valid ov on ov.shopify_id = li.order_id
      where ov.created_at <@ store_today_range()) as units_sold;

create or replace view weekly_metrics as
  select
    (select count(*) from orders_valid where created_at <@ store_week_range()) as new_orders,
    (select coalesce(sum(net_revenue),0) from orders_valid where created_at <@ store_week_range()) as revenue,
    (select count(*) from products where created_at <@ store_week_range()) as new_products,
    (select coalesce(sum(li.quantity),0) from order_line_items li
       join orders_valid ov on ov.shopify_id = li.order_id
      where ov.created_at <@ store_week_range()) as units_sold;

-- Note: the Supabase MCP read-only role (supabase_read_only_user) already reads
-- every object via its pg_read_all_data membership + BYPASSRLS, so no grants to
-- anon/authenticated are needed here. Access hardening (RLS) lives in 0003_rls.sql.
