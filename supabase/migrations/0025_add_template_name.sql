alter table product_templates
  add column if not exists template_name text;

update product_templates
set template_name = name
where template_name is null or template_name = '';

alter table product_templates
  alter column template_name set not null;
