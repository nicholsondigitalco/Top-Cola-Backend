begin;

update orders
set status = case
  when status in ('confirmed', 'preparing') then 'pending'
  when status = 'delivered' then 'complete'
  else status
end;

update order_status_history
set previous_status = case
  when previous_status in ('confirmed', 'preparing') then 'pending'
  when previous_status = 'delivered' then 'complete'
  else previous_status
end
where previous_status is not null;

update order_status_history
set next_status = case
  when next_status in ('confirmed', 'preparing') then 'pending'
  when next_status = 'delivered' then 'complete'
  else next_status
end;

alter table orders drop constraint if exists orders_status_check;
alter table orders
  add constraint orders_status_check
  check (status in ('pending', 'out_for_delivery', 'complete', 'cancelled'));

commit;
