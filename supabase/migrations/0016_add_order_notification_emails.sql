begin;

create table if not exists order_notification_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  is_active boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_order_notification_emails_primary_unique
  on order_notification_emails(is_primary)
  where is_primary = true;

commit;
