alter table products
  alter column cogs_per_unit type numeric(12,4);

alter table order_items
  alter column cogs_per_unit type numeric(12,4);
