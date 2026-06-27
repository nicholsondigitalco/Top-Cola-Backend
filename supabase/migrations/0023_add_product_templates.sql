create table if not exists product_templates (
  id text primary key,
  name text not null,
  short_description text not null default '',
  long_description text not null default '',
  base_price numeric(10,2) not null default 0 check (base_price >= 0),
  cogs_per_unit numeric(12,4) not null default 0 check (cogs_per_unit >= 0),
  category_id text not null references product_categories(id) on delete restrict,
  pricing_group_id text references pricing_groups(id) on delete set null,
  variations jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_product_templates_category on product_templates(category_id);
create index if not exists idx_product_templates_pricing_group on product_templates(pricing_group_id);

drop trigger if exists trg_product_templates_updated_at on product_templates;
create trigger trg_product_templates_updated_at
before update on product_templates
for each row execute procedure set_updated_at();
