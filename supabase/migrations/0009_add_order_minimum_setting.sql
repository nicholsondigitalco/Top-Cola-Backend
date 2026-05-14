begin;

create table if not exists order_settings (
  id text primary key,
  min_order_amount numeric(10,2) not null default 0 check (min_order_amount >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into order_settings (id, min_order_amount)
values ('default', 0)
on conflict (id) do nothing;

drop trigger if exists trg_order_settings_updated_at on order_settings;
create trigger trg_order_settings_updated_at
before update on order_settings
for each row execute procedure set_updated_at();

commit;
