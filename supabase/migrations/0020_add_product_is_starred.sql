alter table products
  add column if not exists is_starred boolean not null default false;

create index if not exists products_is_starred_idx on products (is_starred)
  where is_starred = true;
