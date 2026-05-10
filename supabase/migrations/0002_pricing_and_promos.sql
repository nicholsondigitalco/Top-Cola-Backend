create index if not exists idx_pricing_groups_category on pricing_groups(category_id);
create index if not exists idx_pricing_rules_group on pricing_rules(pricing_group_id);
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_group on products(pricing_group_id);
create index if not exists idx_products_active on products(active);
create unique index if not exists idx_promo_codes_code_lower on promo_codes(lower(code));

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_product_categories_updated_at on product_categories;
create trigger trg_product_categories_updated_at
before update on product_categories
for each row execute procedure set_updated_at();

drop trigger if exists trg_pricing_groups_updated_at on pricing_groups;
create trigger trg_pricing_groups_updated_at
before update on pricing_groups
for each row execute procedure set_updated_at();

drop trigger if exists trg_pricing_rules_updated_at on pricing_rules;
create trigger trg_pricing_rules_updated_at
before update on pricing_rules
for each row execute procedure set_updated_at();

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
before update on products
for each row execute procedure set_updated_at();

drop trigger if exists trg_promo_codes_updated_at on promo_codes;
create trigger trg_promo_codes_updated_at
before update on promo_codes
for each row execute procedure set_updated_at();

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
before update on orders
for each row execute procedure set_updated_at();

drop trigger if exists trg_admin_settings_updated_at on admin_settings;
create trigger trg_admin_settings_updated_at
before update on admin_settings
for each row execute procedure set_updated_at();
