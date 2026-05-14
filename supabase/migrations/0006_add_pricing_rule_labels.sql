begin;

alter table pricing_rules add column if not exists slug text;
alter table pricing_rules add column if not exists name text;

update pricing_rules
set slug = id
where slug is null;

update pricing_rules
set name = initcap(replace(replace(slug, '_rule', ''), '_', ' '))
where name is null;

alter table pricing_rules alter column slug set not null;
alter table pricing_rules alter column name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pricing_rules_slug_key'
  ) then
    alter table pricing_rules add constraint pricing_rules_slug_key unique (slug);
  end if;
end $$;

commit;
