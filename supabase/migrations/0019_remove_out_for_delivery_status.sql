begin;

update orders
set status = 'pending'
where status = 'out_for_delivery';

update order_status_history
set previous_status = 'pending'
where previous_status = 'out_for_delivery';

update order_status_history
set next_status = 'pending'
where next_status = 'out_for_delivery';

alter table orders drop constraint if exists orders_status_check;
alter table orders
  add constraint orders_status_check
  check (status in ('pending', 'complete', 'cancelled'));

commit;
