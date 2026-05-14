begin;

alter table products
  add column if not exists cogs_per_unit numeric(10,2) not null default 0 check (cogs_per_unit >= 0);

alter table order_items
  add column if not exists cogs_per_unit numeric(10,2) not null default 0 check (cogs_per_unit >= 0),
  add column if not exists line_cogs_total numeric(10,2) not null default 0 check (line_cogs_total >= 0);

alter table orders
  add column if not exists cogs_total numeric(10,2) not null default 0 check (cogs_total >= 0),
  add column if not exists gross_profit numeric(10,2) not null default 0;

commit;
