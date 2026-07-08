# TC-Export-enriched.csv → Supabase `products` mapping

## Direct column mapping

| CSV header | Supabase column | Rule |
|------------|-----------------|------|
| `Name` | `name` | Trim; required (max 120 chars) |
| `Regular price` | `base_price` | Parse number; empty → `0` |
| `Categories` | `category_id` | Map Woo breadcrumb → `product_categories.id` (see below) |
| `Tags` | `tags` | Split on `,`, trim, lowercase |
| `Brands` | `tags` | Append brand as lowercase tag |
| *(derived)* | `tags` | Category display name appended if missing (lowercase, e.g. `edibles`) |
| `Attribute 1 value(s)` | `variations` | Split on `,` → `[{ id, name }]` when present |
| — | `id` | `{catPrefix}-{####}` (see ID rule) |
| — | `sku` | Same as `id` |
| — | `active` | Always `true` |
| — | `short_description` | `''` |
| — | `long_description` | `''` |
| — | `image_url` | `null` |
| — | `cogs_per_unit` | `0` |
| — | `pricing_group_id` | `null` |
| — | `is_starred` | `false` |
| — | `variations` | `[]` when no attribute values |

## Category slug resolution

| If `Categories` contains | `category_id` |
|--------------------------|---------------|
| `Edibles` | `edibles` |
| `Vapes` or `Disposables` | `vapes` |
| `Joints` | `joints` |
| `Flower` | `flower` |
| `Concentrates` | `concentrates` |
| `Gear` | `gear` |
| *(else)* | `other` |

## ID / SKU format

`{prefix}-{sequence}` where:

- `prefix` = first 4 letters of the **category display name** (lowercase, letters only)
- `sequence` = 4-digit counter per category (`0001`, `0002`, …) ordered by `record_id`

| Category | Display name | Prefix | Example |
|----------|--------------|--------|---------|
| `vapes` | Vapes | `vape` | `vape-0001` |
| `edibles` | Edibles | `edib` | `edib-0001` |
| `joints` | Joints | `join` | `join-0001` |
| `flower` | Flower | `flow` | `flow-0001` |
| `concentrates` | Concentrates | `conc` | `conc-0001` |
| `gear` | Gear | `gear` | `gear-0001` |
| `other` | Other | `othe` | `othe-0001` |

## Skipped CSV columns

`record_id`, `View`, `Status`, `Sale price`, `Type`, `Children : 0`, `_match_method`, `_matched_large_name`, `Attribute 1 name`, `Attribute 2–10`, `Th Custom Attribute Settings`, `Password`

## Run

```bash
npm run import:tc-products
npm run import:tc-products -- --dry-run
```
