begin;

alter table products
  add column if not exists variations jsonb not null default '[]'::jsonb;

update products
set variations = '[]'::jsonb
where variations is null;

commit;
