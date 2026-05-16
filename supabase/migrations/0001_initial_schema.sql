create extension if not exists "pgcrypto";

create table if not exists product_categories (
  id text primary key,
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists pricing_groups (
  id text primary key,
  slug text unique not null,
  name text not null,
  category_id text not null references product_categories(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists pricing_rules (
  id text primary key,
  slug text unique not null,
  name text not null,
  pricing_group_id text not null references pricing_groups(id) on delete cascade,
  metric text not null check (metric in ('units', 'grams')),
  aggregation text not null default 'by_pricing_group',
  tiers jsonb not null,
  constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists products (
  id text primary key,
  sku text unique not null,
  name text not null,
  description text not null default '',
  image_url text,
  base_price numeric(10,2) not null check (base_price >= 0),
  cogs_per_unit numeric(10,2) not null default 0 check (cogs_per_unit >= 0),
  avg_order_quantity numeric(10,2) not null default 0,
  avg_discount_per_unit numeric(10,2) not null default 0,
  avg_profit_margin_per_unit numeric(10,2) not null default 0,
  variations jsonb not null default '[]'::jsonb,
  category_id text not null references product_categories(id) on delete restrict,
  pricing_group_id text references pricing_groups(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists promo_codes (
  id text primary key,
  code text unique not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value >= 0),
  min_subtotal numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  usage_limit int,
  used_count int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_address text not null,
  delivery_instructions text,
  payment_method text not null check (payment_method in ('cash', 'zelle')),
  scheduled_delivery_time timestamptz,
  status text not null default 'pending' check (status in ('pending', 'out_for_delivery', 'complete', 'cancelled')),
  subtotal numeric(10,2) not null,
  volume_discount numeric(10,2) not null,
  promo_discount numeric(10,2) not null,
  total numeric(10,2) not null,
  savings numeric(10,2) not null,
  cogs_total numeric(10,2) not null default 0 check (cogs_total >= 0),
  gross_profit numeric(10,2) not null default 0,
  pricing_snapshot jsonb not null,
  promo_code text,
  idempotency_key text unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id text not null references products(id) on delete restrict,
  product_name_snapshot text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_base_price numeric(10,2) not null,
  line_subtotal numeric(10,2) not null,
  line_discount numeric(10,2) not null,
  line_total numeric(10,2) not null,
  cogs_per_unit numeric(10,2) not null default 0 check (cogs_per_unit >= 0),
  line_cogs_total numeric(10,2) not null default 0 check (line_cogs_total >= 0),
  pricing_group_slug text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  previous_status text,
  next_status text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists admin_settings (
  id uuid primary key default gen_random_uuid(),
  admin_password_hash text not null,
  notification_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists order_settings (
  id text primary key,
  min_order_amount numeric(10,2) not null default 0 check (min_order_amount >= 0),
  min_delivery_buffer_minutes int not null default 45 check (min_delivery_buffer_minutes >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
