update products p
set tags = p.tags || lower(pc.name)
from product_categories pc
where p.category_id = pc.id
  and not (lower(pc.name) = any(p.tags));

update product_templates t
set tags = t.tags || lower(pc.name)
from product_categories pc
where t.category_id = pc.id
  and not (lower(pc.name) = any(t.tags));
