-- Convert selected UUID primary keys to human-readable text IDs.
-- Affected root tables: product_categories, pricing_groups, pricing_rules, products, promo_codes.
-- Also updates dependent foreign key columns.

begin;

update products
set sku = 'product_' || replace(substr(id::text, 1, 12), '-', '')
where sku is null;

alter table products alter column sku set not null;

alter table product_categories add column id_text text;
update product_categories set id_text = slug;

alter table pricing_groups
  add column id_text text,
  add column category_id_text text;
update pricing_groups pg
set
  id_text = pg.slug,
  category_id_text = pc.slug
from product_categories pc
where pg.category_id = pc.id;

alter table pricing_rules
  add column id_text text,
  add column pricing_group_id_text text;
update pricing_rules pr
set
  id_text = pg.slug || '_rule',
  pricing_group_id_text = pg.slug
from pricing_groups pg
where pr.pricing_group_id = pg.id;

alter table products
  add column id_text text,
  add column category_id_text text,
  add column pricing_group_id_text text;
update products p
set
  id_text = p.sku,
  category_id_text = pc.slug,
  pricing_group_id_text = pg.slug
from product_categories pc, pricing_groups pg
where p.category_id = pc.id
  and p.pricing_group_id = pg.id;

alter table promo_codes add column id_text text;
update promo_codes set id_text = lower(code);

alter table order_items add column product_id_text text;
update order_items oi
set product_id_text = p.sku
from products p
where oi.product_id = p.id;

alter table pricing_groups drop constraint if exists pricing_groups_category_id_fkey;
alter table pricing_rules drop constraint if exists pricing_rules_pricing_group_id_fkey;
alter table products drop constraint if exists products_category_id_fkey;
alter table products drop constraint if exists products_pricing_group_id_fkey;
alter table order_items drop constraint if exists order_items_product_id_fkey;

alter table product_categories drop constraint if exists product_categories_pkey;
alter table pricing_groups drop constraint if exists pricing_groups_pkey;
alter table pricing_rules drop constraint if exists pricing_rules_pkey;
alter table products drop constraint if exists products_pkey;
alter table promo_codes drop constraint if exists promo_codes_pkey;

alter table product_categories drop column id;
alter table product_categories rename column id_text to id;
alter table product_categories add primary key (id);

alter table pricing_groups drop column id;
alter table pricing_groups drop column category_id;
alter table pricing_groups rename column id_text to id;
alter table pricing_groups rename column category_id_text to category_id;
alter table pricing_groups add primary key (id);

alter table pricing_rules drop column id;
alter table pricing_rules drop column pricing_group_id;
alter table pricing_rules rename column id_text to id;
alter table pricing_rules rename column pricing_group_id_text to pricing_group_id;
alter table pricing_rules add primary key (id);

alter table products drop column id;
alter table products drop column category_id;
alter table products drop column pricing_group_id;
alter table products rename column id_text to id;
alter table products rename column category_id_text to category_id;
alter table products rename column pricing_group_id_text to pricing_group_id;
alter table products add primary key (id);

alter table promo_codes drop column id;
alter table promo_codes rename column id_text to id;
alter table promo_codes add primary key (id);

alter table order_items drop column product_id;
alter table order_items rename column product_id_text to product_id;

alter table product_categories alter column id set not null;
alter table pricing_groups alter column id set not null;
alter table pricing_groups alter column category_id set not null;
alter table pricing_rules alter column id set not null;
alter table pricing_rules alter column pricing_group_id set not null;
alter table products alter column id set not null;
alter table products alter column category_id set not null;
alter table products alter column pricing_group_id set not null;
alter table promo_codes alter column id set not null;
alter table order_items alter column product_id set not null;

alter table pricing_groups
  add constraint pricing_groups_category_id_fkey
  foreign key (category_id) references product_categories(id) on delete cascade;

alter table pricing_rules
  add constraint pricing_rules_pricing_group_id_fkey
  foreign key (pricing_group_id) references pricing_groups(id) on delete cascade;

alter table products
  add constraint products_category_id_fkey
  foreign key (category_id) references product_categories(id) on delete restrict;

alter table products
  add constraint products_pricing_group_id_fkey
  foreign key (pricing_group_id) references pricing_groups(id) on delete restrict;

alter table order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references products(id) on delete restrict;

create index if not exists idx_pricing_groups_category on pricing_groups(category_id);
create index if not exists idx_pricing_rules_group on pricing_rules(pricing_group_id);
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_group on products(pricing_group_id);

commit;
