update products
set tags = (
  select coalesce(array_agg(distinct tag order by tag), '{}')
  from (
    select lower(trim(value)) as tag
    from unnest(products.tags) as value
    where trim(value) <> ''
  ) normalized
);
