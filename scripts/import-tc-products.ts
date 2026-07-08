import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import WebSocket from "ws";

config();

const CSV_PATH = resolve(process.cwd(), process.argv.find((arg) => arg.endsWith(".csv")) ?? "TC-Export-enriched.csv");
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 50;

const CATEGORY_BY_SLUG: Record<string, { id: string; name: string }> = {
  vapes: { id: "vapes", name: "Vapes" },
  edibles: { id: "edibles", name: "Edibles" },
  joints: { id: "joints", name: "Joints" },
  flower: { id: "flower", name: "Flower" },
  gear: { id: "gear", name: "Gear" },
  concentrates: { id: "concentrates", name: "Concentrates" },
  other: { id: "other", name: "Other" }
};

interface CsvRow {
  Name: string;
  Brands: string;
  Categories: string;
  Tags: string;
  "Regular price": string;
  record_id: string;
  "Attribute 1 value(s)": string;
}

interface ProductInsertRow {
  id: string;
  sku: string;
  name: string;
  short_description: string;
  long_description: string;
  image_url: null;
  base_price: number;
  cogs_per_unit: number;
  category_id: string;
  pricing_group_id: null;
  variations: Array<{ id: string; name: string }>;
  tags: string[];
  active: boolean;
  is_starred: boolean;
  avg_order_quantity: number;
  avg_discount_per_unit: number;
  avg_profit_margin_per_unit: number;
}

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    if (char !== "\r") field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])) as CsvRow;
    return record;
  });
}

function mapCategorySlug(categories: string): string {
  const text = categories.toLowerCase();
  if (text.includes("edibles")) return "edibles";
  if (text.includes("vapes") || text.includes("disposables")) return "vapes";
  if (text.includes("joints")) return "joints";
  if (text.includes("flower")) return "flower";
  if (text.includes("concentrates")) return "concentrates";
  if (text.includes("gear")) return "gear";
  return "other";
}

function categoryPrefix(slug: string): string {
  const name = CATEGORY_BY_SLUG[slug]?.name ?? slug;
  const letters = name.toLowerCase().replace(/[^a-z]/g, "");
  return letters.slice(0, 4).padEnd(4, "x");
}

function normalizeVariationId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function ensureCategoryNameTag(tags: string[], categoryName: string): string[] {
  const normalized = normalizeTags(tags);
  const categoryTag = categoryName.trim().toLowerCase();
  if (!categoryTag || normalized.includes(categoryTag)) return normalized;
  return [...normalized, categoryTag];
}

function parseVariations(rawValues: string): Array<{ id: string; name: string }> {
  const values = rawValues
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const variations: Array<{ id: string; name: string }> = [];
  for (const name of values) {
    const id = normalizeVariationId(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    variations.push({ id, name });
  }
  return variations;
}

function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function buildProductRows(csvRows: CsvRow[]): ProductInsertRow[] {
  const sorted = [...csvRows].sort((a, b) => Number(a.record_id) - Number(b.record_id));
  const counters = new Map<string, number>();

  return sorted.map((row) => {
    const name = row.Name.trim();
    if (!name) throw new Error(`Missing product name for record_id ${row.record_id}`);

    const categorySlug = mapCategorySlug(row.Categories ?? "");
    const category = CATEGORY_BY_SLUG[categorySlug];
    if (!category) throw new Error(`Unknown category slug ${categorySlug}`);

    const next = (counters.get(categorySlug) ?? 0) + 1;
    counters.set(categorySlug, next);
    const id = `${categoryPrefix(categorySlug)}-${String(next).padStart(4, "0")}`;

    const tagParts = [...(row.Tags ?? "").split(","), row.Brands ?? ""];

    return {
      id,
      sku: id,
      name,
      short_description: "",
      long_description: "",
      image_url: null,
      base_price: parsePrice(row["Regular price"] ?? ""),
      cogs_per_unit: 0,
      category_id: category.id,
      pricing_group_id: null,
      variations: parseVariations(row["Attribute 1 value(s)"] ?? ""),
      tags: ensureCategoryNameTag(tagParts, category.name),
      active: true,
      is_starred: false,
      avg_order_quantity: 0,
      avg_discount_per_unit: 0,
      avg_profit_margin_per_unit: 0
    };
  });
}

function validateRows(rows: ProductInsertRow[]): void {
  const ids = new Set<string>();
  const skus = new Set<string>();

  for (const row of rows) {
    if (!/^[a-z]{4}-\d{4}$/.test(row.id)) {
      throw new Error(`Invalid id format: ${row.id}`);
    }
    if (row.sku !== row.id) throw new Error(`SKU must match id for ${row.id}`);
    if (row.name.length < 2 || row.name.length > 120) {
      throw new Error(`Invalid name length for ${row.id}: ${row.name.length}`);
    }
    if (!Number.isFinite(row.base_price) || row.base_price < 0) {
      throw new Error(`Invalid base_price for ${row.id}`);
    }
    if (!CATEGORY_BY_SLUG[row.category_id]) {
      throw new Error(`Invalid category_id for ${row.id}: ${row.category_id}`);
    }
    if (ids.has(row.id)) throw new Error(`Duplicate id ${row.id}`);
    if (skus.has(row.sku)) throw new Error(`Duplicate sku ${row.sku}`);
    ids.add(row.id);
    skus.add(row.sku);
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as any }
  });

  const csvContent = readFileSync(CSV_PATH, "utf8");
  const csvRows = parseCsv(csvContent);
  const products = buildProductRows(csvRows);
  validateRows(products);

  const byCategory = Object.fromEntries(
    Object.keys(CATEGORY_BY_SLUG).map((slug) => [slug, products.filter((row) => row.category_id === slug).length])
  );

  console.log(`Parsed ${csvRows.length} CSV rows → ${products.length} products`);
  console.log("By category:", byCategory);
  console.log("Sample IDs:", products.slice(0, 5).map((row) => `${row.id} | ${row.name}`));

  if (DRY_RUN) {
    console.log("Dry run complete. No database writes performed.");
    return;
  }

  const { data: categories, error: categoryError } = await supabase
    .from("product_categories")
    .select("id")
    .in("id", Object.keys(CATEGORY_BY_SLUG));
  if (categoryError) throw categoryError;

  const known = new Set((categories ?? []).map((row) => row.id));
  for (const slug of Object.keys(CATEGORY_BY_SLUG)) {
    if (!known.has(slug)) {
      throw new Error(`Missing product_categories row for slug "${slug}". Run seed/migrations first.`);
    }
  }

  let inserted = 0;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("products").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    inserted += batch.length;
    console.log(`Upserted ${inserted}/${products.length}`);
  }

  console.log(`Import complete: ${inserted} products upserted.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
