begin;

alter table products
  add column if not exists avg_order_quantity numeric(10,2) not null default 0,
  add column if not exists avg_discount_per_unit numeric(10,2) not null default 0,
  add column if not exists avg_profit_margin_per_unit numeric(10,2) not null default 0;

create or replace function refresh_product_order_item_averages(p_product_id text)
returns void
language plpgsql
as $$
begin
  update products p
  set
    avg_order_quantity = coalesce(agg.avg_order_quantity, 0),
    avg_discount_per_unit = coalesce(agg.avg_discount_per_unit, 0),
    avg_profit_margin_per_unit = coalesce(agg.avg_profit_margin_per_unit, 0)
  from (
    select
      oi.product_id,
      round(avg(oi.quantity)::numeric, 2) as avg_order_quantity,
      round(avg(oi.line_discount / nullif(oi.quantity, 0))::numeric, 2) as avg_discount_per_unit,
      round(avg((oi.line_total - oi.line_cogs_total) / nullif(oi.quantity, 0))::numeric, 2)
        as avg_profit_margin_per_unit
    from order_items oi
    where oi.product_id = p_product_id
    group by oi.product_id
  ) agg
  where p.id = p_product_id;

  update products
  set
    avg_order_quantity = 0,
    avg_discount_per_unit = 0,
    avg_profit_margin_per_unit = 0
  where id = p_product_id
    and not exists (
      select 1
      from order_items oi
      where oi.product_id = p_product_id
    );
end;
$$;

create or replace function sync_product_order_item_averages()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform refresh_product_order_item_averages(new.product_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform refresh_product_order_item_averages(new.product_id);
    if old.product_id is distinct from new.product_id then
      perform refresh_product_order_item_averages(old.product_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform refresh_product_order_item_averages(old.product_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_product_order_item_averages on order_items;
create trigger trg_sync_product_order_item_averages
after insert or update or delete on order_items
for each row
execute function sync_product_order_item_averages();

with product_agg as (
  select
    oi.product_id,
    round(avg(oi.quantity)::numeric, 2) as avg_order_quantity,
    round(avg(oi.line_discount / nullif(oi.quantity, 0))::numeric, 2) as avg_discount_per_unit,
    round(avg((oi.line_total - oi.line_cogs_total) / nullif(oi.quantity, 0))::numeric, 2)
      as avg_profit_margin_per_unit
  from order_items oi
  group by oi.product_id
)
update products p
set
  avg_order_quantity = coalesce(a.avg_order_quantity, 0),
  avg_discount_per_unit = coalesce(a.avg_discount_per_unit, 0),
  avg_profit_margin_per_unit = coalesce(a.avg_profit_margin_per_unit, 0)
from product_agg a
where p.id = a.product_id;

update products p
set
  avg_order_quantity = 0,
  avg_discount_per_unit = 0,
  avg_profit_margin_per_unit = 0
where not exists (
  select 1
  from order_items oi
  where oi.product_id = p.id
);

commit;
