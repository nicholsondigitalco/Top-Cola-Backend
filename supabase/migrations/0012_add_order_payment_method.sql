begin;

alter table orders
  add column if not exists payment_method text;

update orders
set payment_method = 'cash'
where payment_method is null;

alter table orders
  alter column payment_method set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_payment_method_check'
      and conrelid = 'orders'::regclass
  ) then
    alter table orders
      add constraint orders_payment_method_check
      check (payment_method in ('cash', 'zelle'));
  end if;
end $$;

commit;
