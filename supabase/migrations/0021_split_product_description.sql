alter table products
  add column if not exists short_description text not null default '',
  add column if not exists long_description text not null default '';

update products
set
  long_description = coalesce(description, ''),
  short_description = left(coalesce(description, ''), 280)
where description is not null;

alter table products
  drop column if exists description;
