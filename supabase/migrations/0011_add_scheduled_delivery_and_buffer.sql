begin;

alter table orders
  add column if not exists scheduled_delivery_time timestamptz;

alter table order_settings
  add column if not exists min_delivery_buffer_minutes int not null default 45
  check (min_delivery_buffer_minutes >= 0);

update order_settings
set min_delivery_buffer_minutes = 45
where min_delivery_buffer_minutes is null;

commit;
