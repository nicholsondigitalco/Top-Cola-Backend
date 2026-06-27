alter table product_templates
  add column if not exists sku text,
  add column if not exists image_url text,
  add column if not exists is_starred boolean not null default false;

create table if not exists product_template_images (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references product_templates(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  alt_text text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_product_template_images_primary_unique
  on product_template_images(template_id)
  where is_primary = true;

create index if not exists idx_product_template_images_template
  on product_template_images(template_id);
