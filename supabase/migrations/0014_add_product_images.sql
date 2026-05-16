begin;

insert into storage.buckets (id, name, public)
select 'product-images', 'product-images', true
where not exists (
  select 1 from storage.buckets where id = 'product-images'
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  alt_text text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_product_images_primary_unique
  on product_images(product_id)
  where is_primary = true;

commit;
