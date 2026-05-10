insert into product_categories (id, slug, name)
values
  ('vapes', 'vapes', 'Vapes'),
  ('edibles', 'edibles', 'Edibles'),
  ('joints', 'joints', 'Joints'),
  ('flower', 'flower', 'Flower'),
  ('other', 'other', 'Other')
on conflict (slug) do update set name = excluded.name;

with cats as (
  select id, slug from product_categories
)
insert into pricing_groups (id, slug, name, category_id)
values
  ('vape_default', 'vape_default', 'Vape Default', (select id from cats where slug = 'vapes')),
  ('edible_default', 'edible_default', 'Edible Default', (select id from cats where slug = 'edibles')),
  ('joint_hash_bullets', 'joint_hash_bullets', 'Joint - Hash Bullets', (select id from cats where slug = 'joints')),
  ('joint_litstix_diamond_house', 'joint_litstix_diamond_house', 'Joint - Lit Stix / Diamond / House', (select id from cats where slug = 'joints')),
  ('joint_baby_woods', 'joint_baby_woods', 'Joint - Baby Woods', (select id from cats where slug = 'joints')),
  ('joint_white_recluse', 'joint_white_recluse', 'Joint - White Recluse', (select id from cats where slug = 'joints')),
  ('flower_smalls', 'flower_smalls', 'Flower - Smalls', (select id from cats where slug = 'flower')),
  ('flower_b_nugs', 'flower_b_nugs', 'Flower - B-Nugs', (select id from cats where slug = 'flower')),
  ('flower_top_shelf', 'flower_top_shelf', 'Flower - Top Shelf', (select id from cats where slug = 'flower')),
  ('flower_premium', 'flower_premium', 'Flower - Premium', (select id from cats where slug = 'flower')),
  ('flower_exotic', 'flower_exotic', 'Flower - Exotic', (select id from cats where slug = 'flower')),
  ('flower_private_reserve', 'flower_private_reserve', 'Flower - Private Reserve', (select id from cats where slug = 'flower'))
on conflict (slug) do update set name = excluded.name;

delete from pricing_rules;

insert into pricing_rules (id, pricing_group_id, metric, aggregation, tiers, constraints)
values
  (
    'vape_default_rule',
    (select id from pricing_groups where slug = 'vape_default'),
    'units',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":2,"adjustment_type":"fixed_per_unit","adjustment_value":5},
      {"min":5,"adjustment_type":"fixed_per_unit","adjustment_value":10}
    ]'::jsonb,
    '{}'::jsonb
  ),
  (
    'edible_default_rule',
    (select id from pricing_groups where slug = 'edible_default'),
    'units',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":5,"adjustment_type":"percent","adjustment_value":20},
      {"min":10,"adjustment_type":"percent","adjustment_value":30}
    ]'::jsonb,
    '{}'::jsonb
  ),
  (
    'joint_hash_bullets_rule',
    (select id from pricing_groups where slug = 'joint_hash_bullets'),
    'units',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":5,"adjustment_type":"percent","adjustment_value":10},
      {"min":10,"adjustment_type":"percent","adjustment_value":25}
    ]'::jsonb,
    '{}'::jsonb
  ),
  (
    'joint_litstix_diamond_house_rule',
    (select id from pricing_groups where slug = 'joint_litstix_diamond_house'),
    'units',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":5,"adjustment_type":"percent","adjustment_value":20},
      {"min":10,"adjustment_type":"percent","adjustment_value":40}
    ]'::jsonb,
    '{}'::jsonb
  ),
  (
    'joint_baby_woods_rule',
    (select id from pricing_groups where slug = 'joint_baby_woods'),
    'units',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":5,"adjustment_type":"fixed_per_unit","adjustment_value":3},
      {"min":10,"adjustment_type":"fixed_per_unit","adjustment_value":5}
    ]'::jsonb,
    '{}'::jsonb
  ),
  (
    'joint_white_recluse_rule',
    (select id from pricing_groups where slug = 'joint_white_recluse'),
    'units',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":5,"adjustment_type":"fixed_per_unit","adjustment_value":1},
      {"min":10,"adjustment_type":"percent","adjustment_value":20}
    ]'::jsonb,
    '{}'::jsonb
  ),
  (
    'flower_smalls_rule',
    (select id from pricing_groups where slug = 'flower_smalls'),
    'grams',
    'by_pricing_group',
    '[
      {"min":16,"adjustment_type":"none","adjustment_value":0},
      {"min":32,"adjustment_type":"percent","adjustment_value":20},
      {"min":40,"adjustment_type":"percent","adjustment_value":20}
    ]'::jsonb,
    '{"allowed_quantities":[1,4,8,16,32,40],"min_checkout_grams":16}'::jsonb
  ),
  (
    'flower_b_nugs_rule',
    (select id from pricing_groups where slug = 'flower_b_nugs'),
    'grams',
    'by_pricing_group',
    '[
      {"min":16,"adjustment_type":"none","adjustment_value":0},
      {"min":32,"adjustment_type":"percent","adjustment_value":16.67},
      {"min":40,"adjustment_type":"percent","adjustment_value":16.67}
    ]'::jsonb,
    '{"allowed_quantities":[1,4,8,16,32,40],"min_checkout_grams":16}'::jsonb
  ),
  (
    'flower_top_shelf_rule',
    (select id from pricing_groups where slug = 'flower_top_shelf'),
    'grams',
    'by_pricing_group',
    '[
      {"min":4,"adjustment_type":"none","adjustment_value":0},
      {"min":8,"adjustment_type":"none","adjustment_value":0},
      {"min":16,"adjustment_type":"percent","adjustment_value":20},
      {"min":32,"adjustment_type":"percent","adjustment_value":30},
      {"min":40,"adjustment_type":"percent","adjustment_value":30}
    ]'::jsonb,
    '{"allowed_quantities":[1,4,8,16,32,40]}'::jsonb
  ),
  (
    'flower_premium_rule',
    (select id from pricing_groups where slug = 'flower_premium'),
    'grams',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":4,"adjustment_type":"percent","adjustment_value":12.5},
      {"min":8,"adjustment_type":"percent","adjustment_value":12.5},
      {"min":16,"adjustment_type":"percent","adjustment_value":25},
      {"min":32,"adjustment_type":"percent","adjustment_value":37.5},
      {"min":40,"adjustment_type":"percent","adjustment_value":37.5}
    ]'::jsonb,
    '{"allowed_quantities":[1,4,8,16,32,40]}'::jsonb
  ),
  (
    'flower_exotic_rule',
    (select id from pricing_groups where slug = 'flower_exotic'),
    'grams',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":4,"adjustment_type":"percent","adjustment_value":25},
      {"min":8,"adjustment_type":"percent","adjustment_value":33.33},
      {"min":16,"adjustment_type":"percent","adjustment_value":41.67},
      {"min":32,"adjustment_type":"percent","adjustment_value":50},
      {"min":40,"adjustment_type":"percent","adjustment_value":50}
    ]'::jsonb,
    '{"allowed_quantities":[1,4,8,16,32,40]}'::jsonb
  ),
  (
    'flower_private_reserve_rule',
    (select id from pricing_groups where slug = 'flower_private_reserve'),
    'grams',
    'by_pricing_group',
    '[
      {"min":1,"adjustment_type":"none","adjustment_value":0},
      {"min":4,"adjustment_type":"percent","adjustment_value":8.33},
      {"min":8,"adjustment_type":"percent","adjustment_value":37.5},
      {"min":16,"adjustment_type":"percent","adjustment_value":43.75},
      {"min":32,"adjustment_type":"percent","adjustment_value":50},
      {"min":40,"adjustment_type":"percent","adjustment_value":50}
    ]'::jsonb,
    '{"allowed_quantities":[1,4,8,16,32,40]}'::jsonb
  );

insert into products (id, sku, name, description, image_url, base_price, category_id, pricing_group_id, active)
values
  (
    'VAPE-001',
    'VAPE-001',
    'Sample Disposable Vape',
    'Sample vape product',
    null,
    35.00,
    (select id from product_categories where slug = 'vapes'),
    (select id from pricing_groups where slug = 'vape_default'),
    true
  ),
  (
    'EDIB-001',
    'EDIB-001',
    'Sample Gummies',
    'Sample edible product',
    null,
    20.00,
    (select id from product_categories where slug = 'edibles'),
    (select id from pricing_groups where slug = 'edible_default'),
    true
  ),
  (
    'FLOW-001',
    'FLOW-001',
    'Sample Premium Flower',
    'Sample flower product',
    null,
    10.00,
    (select id from product_categories where slug = 'flower'),
    (select id from pricing_groups where slug = 'flower_premium'),
    true
  )
on conflict (sku) do nothing;
