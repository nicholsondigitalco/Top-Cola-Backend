create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at desc);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_order_status_history_order on order_status_history(order_id);

alter table orders
  add constraint orders_money_non_negative
  check (
    subtotal >= 0
    and volume_discount >= 0
    and promo_discount >= 0
    and total >= 0
    and savings >= 0
  );
