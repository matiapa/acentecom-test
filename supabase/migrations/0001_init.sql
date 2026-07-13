create table if not exists products (
  shopify_id      bigint primary key,
  title           text,
  handle          text,
  vendor          text,
  product_type    text,
  status          text,
  tags            text[] not null default '{}',
  total_inventory integer,
  min_price       numeric(12,2),
  max_price       numeric(12,2),
  created_at      timestamptz,
  updated_at      timestamptz,
  synced_at       timestamptz not null default now()
);

create table if not exists product_variants (
  shopify_id        bigint primary key,
  product_id        bigint references products(shopify_id) on delete cascade,
  title             text,
  sku               text,
  price             numeric(12,2),
  compare_at_price  numeric(12,2),
  inventory_quantity integer,
  position          integer,
  created_at        timestamptz,
  updated_at        timestamptz,
  synced_at         timestamptz not null default now()
);

create table if not exists customers (
  shopify_id   bigint primary key,
  email        text,
  first_name   text,
  last_name    text,
  orders_count integer,
  total_spent  numeric(12,2),
  state        text,
  created_at   timestamptz,
  updated_at   timestamptz,
  synced_at    timestamptz not null default now()
);

create table if not exists orders (
  shopify_id        bigint primary key,
  name              text,
  customer_id       bigint,
  email             text,
  financial_status  text,
  fulfillment_status text,
  currency          text,
  test              boolean not null default false,
  subtotal_price    numeric(12,2),
  total_tax         numeric(12,2),
  total_discounts   numeric(12,2),
  total_refunded    numeric(12,2),
  total_price       numeric(12,2),
  created_at        timestamptz,
  processed_at      timestamptz,
  updated_at        timestamptz,
  cancelled_at      timestamptz,
  synced_at         timestamptz not null default now()
);

create table if not exists order_line_items (
  shopify_id     bigint primary key,
  order_id       bigint references orders(shopify_id) on delete cascade,
  product_id     bigint,
  variant_id     bigint,
  title          text,
  variant_title  text,
  sku            text,
  quantity       integer,
  price          numeric(12,2),
  total_discount numeric(12,2),
  synced_at      timestamptz not null default now()
);

create table if not exists sync_state (
  id               integer primary key check (id = 1),
  last_synced_at   timestamptz,
  last_status      text,
  last_error       text,
  products_synced  integer,
  variants_synced  integer,
  orders_synced    integer,
  line_items_synced integer,
  customers_synced integer,
  duration_ms      integer,
  updated_at       timestamptz not null default now()
);
insert into sync_state (id) values (1) on conflict (id) do nothing;

create index if not exists idx_orders_created_at on orders (created_at);
create index if not exists idx_products_created_at on products (created_at);
create index if not exists idx_line_items_order_id on order_line_items (order_id);
create index if not exists idx_line_items_product_id on order_line_items (product_id);
