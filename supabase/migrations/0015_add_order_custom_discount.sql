begin;

alter table orders
  add column if not exists custom_discount numeric(10,2) not null default 0
  check (custom_discount >= 0);

update orders
set custom_discount = 0
where custom_discount is null;

commit;
