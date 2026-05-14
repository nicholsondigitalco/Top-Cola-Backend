begin;

alter table products alter column pricing_group_id drop not null;

alter table products drop constraint if exists products_pricing_group_id_fkey;
alter table products
  add constraint products_pricing_group_id_fkey
  foreign key (pricing_group_id) references pricing_groups(id) on delete set null;

update products
set pricing_group_id = null
where pricing_group_id in (
  'vape_default',
  'edible_default',
  'gear_default',
  'concentrates_default'
);

delete from pricing_rules
where pricing_group_id in (
  'vape_default',
  'edible_default',
  'gear_default',
  'concentrates_default'
);

delete from pricing_groups
where id in (
  'vape_default',
  'edible_default',
  'gear_default',
  'concentrates_default'
);

commit;
