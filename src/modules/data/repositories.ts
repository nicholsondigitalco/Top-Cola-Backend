import { randomUUID } from "node:crypto";
import { supabase } from "../../lib/supabase.js";
import type { PricingRule, Product, ProductImage, ProductTemplate, ProductVariation, PromoCode } from "../pricing/pricing.types.js";

export interface OrderInsertInput {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_instructions?: string;
  payment_method: "cash" | "zelle";
  scheduled_delivery_time?: string;
  status: "pending" | "complete" | "cancelled";
  subtotal: number;
  volume_discount: number;
  promo_discount: number;
  custom_discount?: number;
  total: number;
  savings: number;
  cogs_total: number;
  gross_profit: number;
  pricing_snapshot: unknown;
  promo_code?: string;
  idempotency_key?: string;
}

export interface OrderItemInsertInput {
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_base_price: number;
  line_subtotal: number;
  line_discount: number;
  line_total: number;
  cogs_per_unit: number;
  line_cogs_total: number;
  pricing_group_slug: string;
}

export interface OrderItemRecord extends OrderItemInsertInput {
  id: string;
  order_id: string;
  created_at: string;
}

export interface OrderRecord {
  id: string;
  status: "pending" | "complete" | "cancelled";
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_instructions: string | null;
  payment_method: "cash" | "zelle";
  scheduled_delivery_time: string | null;
  subtotal: number;
  volume_discount: number;
  promo_discount: number;
  custom_discount?: number;
  total: number;
  savings: number;
  promo_code: string | null;
  pricing_snapshot?: unknown;
}

export interface ProductCategoryRecord {
  id: string;
  slug: string;
  name: string;
}

export interface ProductCostRecord {
  id: string;
  cogs_per_unit: number;
}

export interface ProductImageRecord extends ProductImage {
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  created_at: string;
}

export interface ProductTemplateImageRecord extends ProductImage {
  template_id: string;
  storage_path: string;
  alt_text: string | null;
  created_at: string;
}

export interface OrderSettingsRecord {
  min_order_amount: number;
  min_delivery_buffer_minutes: number;
}

export interface NotificationEmailRecord {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

const PRODUCT_TEMPLATE_SELECT = `
  id, template_name, sku, name, short_description, long_description, image_url, base_price, cogs_per_unit, category_id, pricing_group_id, variations, tags, active, is_starred, created_at, updated_at,
  product_categories!inner(slug, name),
  pricing_groups(slug, name),
  product_template_images(id, image_url, is_primary, sort_order)
`;

const mapProductTemplate = (row: any): ProductTemplate => ({
  id: row.id,
  template_name: row.template_name ?? row.name,
  sku: row.sku,
  name: row.name,
  short_description: row.short_description ?? "",
  long_description: row.long_description ?? "",
  image_url: row.image_url,
  base_price: Number(row.base_price),
  cogs_per_unit: Number(row.cogs_per_unit ?? 0),
  category_id: row.category_id,
  category_slug: row.product_categories.slug,
  category_name: row.product_categories.name,
  pricing_group_id: row.pricing_group_id,
  pricing_group_slug: row.pricing_groups?.slug ?? null,
  pricing_group_name: row.pricing_groups?.name ?? null,
  primary_image_url: row.image_url,
  gallery_images: Array.isArray(row.product_template_images)
    ? row.product_template_images
        .map((image: any) => ({
          id: image.id,
          image_url: image.image_url,
          is_primary: Boolean(image.is_primary),
          sort_order: Number(image.sort_order ?? 0)
        }))
        .sort((a: any, b: any) => {
          if (a.is_primary === b.is_primary) return a.sort_order - b.sort_order;
          return a.is_primary ? -1 : 1;
        })
    : [],
  variations: mapProductVariations(row.variations),
  tags: normalizeProductTags(row.tags),
  active: row.active,
  is_starred: Boolean(row.is_starred),
  created_at: row.created_at,
  updated_at: row.updated_at
});

const PRODUCT_DETAIL_SELECT = `
  id, sku, name, short_description, long_description, image_url, base_price, cogs_per_unit, category_id, pricing_group_id, variations, tags, active, is_starred,
  avg_order_quantity, avg_discount_per_unit, avg_profit_margin_per_unit, created_at, updated_at,
  product_categories!inner(slug, name),
  pricing_groups(slug, name),
  product_images(id, image_url, is_primary, sort_order)
`;

const mapProduct = (row: any): Product => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  short_description: row.short_description ?? "",
  long_description: row.long_description ?? "",
  image_url: row.image_url,
  base_price: Number(row.base_price),
  cogs_per_unit: Number(row.cogs_per_unit ?? 0),
  category_id: row.category_id,
  category_slug: row.product_categories.slug,
  category_name: row.product_categories.name,
  pricing_group_id: row.pricing_group_id,
  pricing_group_slug: row.pricing_groups?.slug ?? null,
  pricing_group_name: row.pricing_groups?.name ?? null,
  primary_image_url: row.image_url,
  gallery_images: Array.isArray(row.product_images)
    ? row.product_images
        .map((image: any) => ({
          id: image.id,
          image_url: image.image_url,
          is_primary: Boolean(image.is_primary),
          sort_order: Number(image.sort_order ?? 0)
        }))
        .sort((a: any, b: any) => {
          if (a.is_primary === b.is_primary) return a.sort_order - b.sort_order;
          return a.is_primary ? -1 : 1;
        })
    : [],
  variations: mapProductVariations(row.variations),
  tags: normalizeProductTags(row.tags),
  avg_order_quantity: Number(row.avg_order_quantity ?? 0),
  avg_discount_per_unit: Number(row.avg_discount_per_unit ?? 0),
  avg_profit_margin_per_unit: Number(row.avg_profit_margin_per_unit ?? 0),
  active: row.active,
  is_starred: Boolean(row.is_starred),
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapRule = (row: any): PricingRule => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  pricing_group_id: row.pricing_group_id,
  metric: row.metric,
  aggregation: row.aggregation,
  tiers: row.tiers,
  constraints: row.constraints ?? {}
});

const mapPromo = (row: any): PromoCode => ({
  id: row.id,
  code: row.code,
  description: row.description ?? null,
  discount_type: row.discount_type,
  discount_value: Number(row.discount_value),
  min_subtotal: Number(row.min_subtotal),
  max_discount: row.max_discount === null ? null : Number(row.max_discount),
  usage_limit: row.usage_limit,
  used_count: row.used_count,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  active: row.active
});

const mapCategory = (row: any): ProductCategoryRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name
});

const mapProductCost = (row: any): ProductCostRecord => ({
  id: row.id,
  cogs_per_unit: Number(row.cogs_per_unit ?? 0)
});

const mapProductImage = (row: any): ProductImageRecord => ({
  id: row.id,
  product_id: row.product_id,
  storage_path: row.storage_path,
  image_url: row.image_url,
  alt_text: row.alt_text ?? null,
  sort_order: Number(row.sort_order ?? 0),
  is_primary: Boolean(row.is_primary),
  created_at: row.created_at
});

const mapProductTemplateImage = (row: any): ProductTemplateImageRecord => ({
  id: row.id,
  template_id: row.template_id,
  storage_path: row.storage_path,
  image_url: row.image_url,
  alt_text: row.alt_text ?? null,
  sort_order: Number(row.sort_order ?? 0),
  is_primary: Boolean(row.is_primary),
  created_at: row.created_at
});

const mapOrderSettings = (row: any): OrderSettingsRecord => ({
  min_order_amount: Number(row.min_order_amount ?? 0),
  min_delivery_buffer_minutes: Number(row.min_delivery_buffer_minutes ?? 45)
});

const mapNotificationEmail = (row: any): NotificationEmailRecord => ({
  id: row.id,
  email: row.email,
  name: row.name ?? null,
  is_active: Boolean(row.is_active),
  is_primary: Boolean(row.is_primary),
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapProductVariations = (value: unknown): ProductVariation[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const maybeId = "id" in item ? (item as any).id : undefined;
      const maybeName = "name" in item ? (item as any).name : undefined;
      if (typeof maybeId !== "string" || typeof maybeName !== "string") return null;
      const id = maybeId.trim();
      const name = maybeName.trim();
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((item): item is ProductVariation => Boolean(item));
};

const normalizeProductTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of value) {
    if (typeof rawTag !== "string") continue;
    const tag = rawTag.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
};

const sanitizeIdentifier = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

export const catalogRepository = {
  async listCategories(): Promise<ProductCategoryRecord[]> {
    const { data, error } = await supabase
      .from("product_categories")
      .select("id, slug, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapCategory);
  },

  async createCategory(payload: { slug: string; name: string }): Promise<ProductCategoryRecord> {
    const id = sanitizeIdentifier(payload.slug);
    if (!id) throw new Error("Category slug is required.");
    const { data, error } = await supabase
      .from("product_categories")
      .insert({ id, slug: id, name: payload.name })
      .select("id, slug, name")
      .single();
    if (error) throw error;
    return mapCategory(data);
  },

  async updateCategory(categoryId: string, payload: { name?: string }): Promise<ProductCategoryRecord> {
    const { data, error } = await supabase
      .from("product_categories")
      .update({ name: payload.name })
      .eq("id", categoryId)
      .select("id, slug, name")
      .single();
    if (error) throw error;
    return mapCategory(data);
  },

  async deleteCategory(categoryId: string): Promise<void> {
    const { error } = await supabase.from("product_categories").delete().eq("id", categoryId);
    if (error) throw error;
  },

  async listProducts(filters: { categorySlug?: string; active?: boolean; tags?: string[] } = {}): Promise<Product[]> {
    let query = supabase
      .from("products")
      .select(PRODUCT_DETAIL_SELECT)
      .order("created_at", { ascending: false });

    if (filters.active !== undefined) {
      query = query.eq("active", filters.active);
    }

    if (filters.categorySlug) {
      query = query.eq("product_categories.slug", filters.categorySlug);
    }
    if (filters.tags && filters.tags.length > 0) {
      const normalizedTags = normalizeProductTags(filters.tags);
      if (normalizedTags.length > 0) {
        query = query.overlaps("tags", normalizedTags);
      }
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []).map(mapProduct);
  },

  async getProductsByIds(productIds: string[]): Promise<Product[]> {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_DETAIL_SELECT)
      .in("id", productIds)
      .eq("active", true);
    if (error) {
      throw error;
    }
    return (data ?? []).map(mapProduct);
  },

  async getProductById(productId: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_DETAIL_SELECT)
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapProduct(data);
  },

  async getProductCostsByIds(productIds: string[]): Promise<ProductCostRecord[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await supabase
      .from("products")
      .select("id, cogs_per_unit")
      .in("id", productIds);
    if (error) throw error;
    return (data ?? []).map(mapProductCost);
  },

  async createProduct(payload: {
    sku?: string;
    name: string;
    short_description?: string;
    long_description?: string;
    image_url?: string;
    base_price: number;
    cogs_per_unit?: number;
    category_slug: string;
    pricing_group_slug?: string | null;
    variations?: ProductVariation[];
    tags?: string[];
    active: boolean;
    is_starred?: boolean;
  }): Promise<Product> {
    const { data: category, error: categoryError } = await supabase
      .from("product_categories")
      .select("id")
      .eq("slug", payload.category_slug)
      .single();
    if (categoryError || !category) {
      throw new Error("Invalid category.");
    }

    let pricingGroupId: string | null = null;
    if (payload.pricing_group_slug) {
      const { data: pricingGroup, error: groupError } = await supabase
        .from("pricing_groups")
        .select("id")
        .eq("slug", payload.pricing_group_slug)
        .single();
      if (groupError || !pricingGroup) {
        throw new Error("Invalid pricing group.");
      }
      pricingGroupId = pricingGroup.id;
    }

    const resolvedSku = payload.sku?.trim() || sanitizeIdentifier(payload.name);
    if (!resolvedSku) {
      throw new Error("Product SKU (or a name that can derive one) is required.");
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        id: resolvedSku,
        sku: resolvedSku,
        name: payload.name,
        short_description: payload.short_description ?? "",
        long_description: payload.long_description ?? "",
        image_url: payload.image_url,
        base_price: payload.base_price,
        cogs_per_unit: payload.cogs_per_unit ?? 0,
        category_id: category.id,
        pricing_group_id: pricingGroupId,
        variations: payload.variations ?? [],
        tags: normalizeProductTags(payload.tags ?? []),
        active: payload.active,
        is_starred: payload.is_starred ?? false
      })
      .select(PRODUCT_DETAIL_SELECT)
      .single();

    if (error) {
      throw error;
    }
    return mapProduct(data);
  },

  async updateProduct(productId: string, patch: Record<string, unknown>): Promise<Product> {
    const nextPatch: Record<string, unknown> = {};
    if (patch.sku !== undefined) nextPatch.sku = patch.sku;
    if (patch.name !== undefined) nextPatch.name = patch.name;
    if (patch.short_description !== undefined) nextPatch.short_description = patch.short_description;
    if (patch.long_description !== undefined) nextPatch.long_description = patch.long_description;
    if (patch.image_url !== undefined) nextPatch.image_url = patch.image_url;
    if (patch.base_price !== undefined) nextPatch.base_price = patch.base_price;
    if (patch.cogs_per_unit !== undefined) nextPatch.cogs_per_unit = patch.cogs_per_unit;
    if (patch.variations !== undefined) nextPatch.variations = patch.variations;
    if (patch.tags !== undefined) nextPatch.tags = normalizeProductTags(patch.tags);
    if (patch.active !== undefined) nextPatch.active = patch.active;
    if (patch.is_starred !== undefined) nextPatch.is_starred = patch.is_starred;

    if (patch.category_slug !== undefined) {
      const { data: category, error } = await supabase
        .from("product_categories")
        .select("id")
        .eq("slug", patch.category_slug)
        .single();
      if (error || !category) throw new Error("Invalid category.");
      nextPatch.category_id = category.id;
    }

    if (patch.pricing_group_slug !== undefined) {
      if (patch.pricing_group_slug === null) {
        nextPatch.pricing_group_id = null;
      } else {
      const { data: group, error } = await supabase
        .from("pricing_groups")
        .select("id")
        .eq("slug", patch.pricing_group_slug)
        .single();
      if (error || !group) throw new Error("Invalid pricing group.");
      nextPatch.pricing_group_id = group.id;
      }
    }

    const { data, error } = await supabase
      .from("products")
      .update(nextPatch)
      .eq("id", productId)
      .select(PRODUCT_DETAIL_SELECT)
      .single();
    if (error) throw error;
    return mapProduct(data);
  },

  async deleteProduct(productId: string): Promise<void> {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) throw error;
  },

  async listProductTemplates(): Promise<ProductTemplate[]> {
    const { data, error } = await supabase
      .from("product_templates")
      .select(PRODUCT_TEMPLATE_SELECT)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProductTemplate);
  },

  async getProductTemplateById(templateId: string): Promise<ProductTemplate | null> {
    const { data, error } = await supabase
      .from("product_templates")
      .select(PRODUCT_TEMPLATE_SELECT)
      .eq("id", templateId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapProductTemplate(data);
  },

  async createProductTemplate(payload: {
    template_name: string;
    sku?: string;
    name: string;
    short_description?: string;
    long_description?: string;
    image_url?: string;
    base_price: number;
    cogs_per_unit?: number;
    category_slug: string;
    pricing_group_slug?: string | null;
    variations?: ProductVariation[];
    tags?: string[];
    active: boolean;
    is_starred?: boolean;
  }): Promise<ProductTemplate> {
    const { data: category, error: categoryError } = await supabase
      .from("product_categories")
      .select("id")
      .eq("slug", payload.category_slug)
      .single();
    if (categoryError || !category) {
      throw new Error("Invalid category.");
    }

    let pricingGroupId: string | null = null;
    if (payload.pricing_group_slug) {
      const { data: pricingGroup, error: groupError } = await supabase
        .from("pricing_groups")
        .select("id")
        .eq("slug", payload.pricing_group_slug)
        .single();
      if (groupError || !pricingGroup) {
        throw new Error("Invalid pricing group.");
      }
      pricingGroupId = pricingGroup.id;
    }

    const resolvedSku = payload.sku?.trim() || sanitizeIdentifier(payload.template_name);
    if (!resolvedSku) {
      throw new Error("Template SKU (or a template name that can derive one) is required.");
    }

    const { data, error } = await supabase
      .from("product_templates")
      .insert({
        id: resolvedSku,
        template_name: payload.template_name,
        sku: resolvedSku,
        name: payload.name,
        short_description: payload.short_description ?? "",
        long_description: payload.long_description ?? "",
        image_url: payload.image_url,
        base_price: payload.base_price,
        cogs_per_unit: payload.cogs_per_unit ?? 0,
        category_id: category.id,
        pricing_group_id: pricingGroupId,
        variations: payload.variations ?? [],
        tags: normalizeProductTags(payload.tags ?? []),
        active: payload.active,
        is_starred: payload.is_starred ?? false
      })
      .select(PRODUCT_TEMPLATE_SELECT)
      .single();

    if (error) throw error;
    return mapProductTemplate(data);
  },

  async updateProductTemplate(templateId: string, patch: Record<string, unknown>): Promise<ProductTemplate> {
    const nextPatch: Record<string, unknown> = {};
    if (patch.template_name !== undefined) nextPatch.template_name = patch.template_name;
    if (patch.sku !== undefined) nextPatch.sku = patch.sku;
    if (patch.name !== undefined) nextPatch.name = patch.name;
    if (patch.short_description !== undefined) nextPatch.short_description = patch.short_description;
    if (patch.long_description !== undefined) nextPatch.long_description = patch.long_description;
    if (patch.image_url !== undefined) nextPatch.image_url = patch.image_url;
    if (patch.base_price !== undefined) nextPatch.base_price = patch.base_price;
    if (patch.cogs_per_unit !== undefined) nextPatch.cogs_per_unit = patch.cogs_per_unit;
    if (patch.variations !== undefined) nextPatch.variations = patch.variations;
    if (patch.tags !== undefined) nextPatch.tags = normalizeProductTags(patch.tags as string[]);
    if (patch.active !== undefined) nextPatch.active = patch.active;
    if (patch.is_starred !== undefined) nextPatch.is_starred = patch.is_starred;

    if (patch.category_slug !== undefined) {
      const { data: category, error } = await supabase
        .from("product_categories")
        .select("id")
        .eq("slug", patch.category_slug)
        .single();
      if (error || !category) throw new Error("Invalid category.");
      nextPatch.category_id = category.id;
    }

    if (patch.pricing_group_slug !== undefined) {
      if (patch.pricing_group_slug === null) {
        nextPatch.pricing_group_id = null;
      } else {
        const { data: group, error } = await supabase
          .from("pricing_groups")
          .select("id")
          .eq("slug", patch.pricing_group_slug)
          .single();
        if (error || !group) throw new Error("Invalid pricing group.");
        nextPatch.pricing_group_id = group.id;
      }
    }

    const { data, error } = await supabase
      .from("product_templates")
      .update(nextPatch)
      .eq("id", templateId)
      .select(PRODUCT_TEMPLATE_SELECT)
      .single();
    if (error) throw error;
    return mapProductTemplate(data);
  },

  async deleteProductTemplate(templateId: string): Promise<void> {
    const { error } = await supabase.from("product_templates").delete().eq("id", templateId);
    if (error) throw error;
  }
};

export interface PricingGroupRecord {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  category_slug: string;
  category_name: string;
}

const mapPricingGroup = (row: any): PricingGroupRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  category_id: row.category_id,
  category_slug: row.product_categories?.slug ?? row.category_id,
  category_name: row.product_categories?.name ?? row.category_id
});

export const pricingGroupRepository = {
  async list(): Promise<PricingGroupRecord[]> {
    const { data, error } = await supabase
      .from("pricing_groups")
      .select("id, slug, name, category_id, product_categories(slug, name)")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPricingGroup);
  },

  async create(payload: { slug: string; name: string; categorySlug: string }): Promise<PricingGroupRecord> {
    const id = sanitizeIdentifier(payload.slug);
    if (!id) throw new Error("Pricing group slug is required.");

    const { data: category, error: categoryError } = await supabase
      .from("product_categories")
      .select("id")
      .eq("slug", payload.categorySlug)
      .maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) throw new Error("Category not found.");

    const { data, error } = await supabase
      .from("pricing_groups")
      .insert({ id, slug: id, name: payload.name, category_id: category.id })
      .select("id, slug, name, category_id, product_categories(slug, name)")
      .single();
    if (error) throw error;
    return mapPricingGroup(data);
  },

  async delete(pricingGroupId: string): Promise<void> {
    const { error } = await supabase.from("pricing_groups").delete().eq("id", pricingGroupId);
    if (error) throw error;
  }
};

export const pricingRepository = {
  async getRulesByPricingGroupIds(pricingGroupIds: string[]): Promise<PricingRule[]> {
    if (pricingGroupIds.length === 0) {
      return [];
    }
    const { data, error } = await supabase
      .from("pricing_rules")
      .select("id, slug, name, pricing_group_id, metric, aggregation, tiers, constraints")
      .in("pricing_group_id", pricingGroupIds);

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapRule);
  },

  async listRules(): Promise<PricingRule[]> {
    const { data, error } = await supabase
      .from("pricing_rules")
      .select("id, slug, name, pricing_group_id, metric, aggregation, tiers, constraints");
    if (error) throw error;
    return (data ?? []).map(mapRule);
  },

  async createRule(input: {
    slug: string;
    name: string;
    pricing_group_id: string;
    metric: "units" | "grams";
    tiers: unknown;
    constraints: unknown;
  }): Promise<PricingRule> {
    const id = sanitizeIdentifier(input.slug);
    if (!id) throw new Error("Pricing rule slug is required.");
    const { data, error } = await supabase
      .from("pricing_rules")
      .insert({
        id,
        slug: id,
        name: input.name,
        pricing_group_id: input.pricing_group_id,
        metric: input.metric,
        aggregation: "by_pricing_group",
        tiers: input.tiers,
        constraints: input.constraints
      })
      .select("id, slug, name, pricing_group_id, metric, aggregation, tiers, constraints")
      .single();
    if (error) throw error;
    return mapRule(data);
  },

  async updateRule(ruleId: string, update: { tiers: unknown; constraints: unknown }): Promise<PricingRule> {
    const { data, error } = await supabase
      .from("pricing_rules")
      .update(update)
      .eq("id", ruleId)
      .select("id, slug, name, pricing_group_id, metric, aggregation, tiers, constraints")
      .single();
    if (error) throw error;
    return mapRule(data);
  }
};

export const promoRepository = {
  async getByCode(code?: string): Promise<PromoCode | null> {
    if (!code) return null;
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .eq("active", true)
      .single();
    if (error) return null;
    return mapPromo(data);
  },

  async listPromos(): Promise<PromoCode[]> {
    const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", {
      ascending: false
    });
    if (error) throw error;
    return (data ?? []).map(mapPromo);
  },

  async createPromo(input: Record<string, unknown>): Promise<PromoCode> {
    const code = typeof input.code === "string" ? input.code : "";
    const promoId = sanitizeIdentifier(code);
    if (!promoId) {
      throw new Error("Promo code is required.");
    }
    const { data, error } = await supabase
      .from("promo_codes")
      .insert({ ...input, id: promoId })
      .select("*")
      .single();
    if (error) throw error;
    return mapPromo(data);
  },

  async updatePromo(promoId: string, input: Record<string, unknown>): Promise<PromoCode> {
    const { data, error } = await supabase
      .from("promo_codes")
      .update(input)
      .eq("id", promoId)
      .select("*")
      .single();
    if (error) throw error;
    return mapPromo(data);
  },

  async deletePromo(promoId: string): Promise<void> {
    const { error } = await supabase.from("promo_codes").delete().eq("id", promoId);
    if (error) throw error;
  },

  async incrementUsage(code: string): Promise<void> {
    const { data, error } = await supabase
      .from("promo_codes")
      .select("used_count")
      .eq("code", code)
      .single();
    if (error || !data) return;
    await supabase
      .from("promo_codes")
      .update({ used_count: (data.used_count as number) + 1 })
      .eq("code", code);
  }
};

export const orderSettingsRepository = {
  async get(): Promise<OrderSettingsRecord> {
    const { data, error } = await supabase
      .from("order_settings")
      .select("min_order_amount, min_delivery_buffer_minutes")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: inserted, error: insertError } = await supabase
        .from("order_settings")
        .insert({ id: "default", min_order_amount: 0, min_delivery_buffer_minutes: 45 })
        .select("min_order_amount, min_delivery_buffer_minutes")
        .single();
      if (insertError) throw insertError;
      return mapOrderSettings(inserted);
    }
    return mapOrderSettings(data);
  },

  async update(
    minOrderAmount: number,
    minDeliveryBufferMinutes: number
  ): Promise<OrderSettingsRecord> {
    const { data, error } = await supabase
      .from("order_settings")
      .upsert(
        {
          id: "default",
          min_order_amount: minOrderAmount,
          min_delivery_buffer_minutes: minDeliveryBufferMinutes
        },
        { onConflict: "id" }
      )
      .select("min_order_amount, min_delivery_buffer_minutes")
      .single();
    if (error) throw error;
    return mapOrderSettings(data);
  }
};

export const notificationEmailRepository = {
  async list(): Promise<NotificationEmailRecord[]> {
    const { data, error } = await supabase
      .from("order_notification_emails")
      .select("id, email, name, is_active, is_primary, created_at, updated_at")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapNotificationEmail);
  },

  async create(input: {
    email: string;
    name?: string;
    is_active: boolean;
    is_primary: boolean;
  }): Promise<NotificationEmailRecord> {
    const { data, error } = await supabase
      .from("order_notification_emails")
      .insert({
        email: input.email,
        name: input.name ?? null,
        is_active: input.is_active,
        is_primary: input.is_primary
      })
      .select("id, email, name, is_active, is_primary, created_at, updated_at")
      .single();
    if (error) throw error;
    return mapNotificationEmail(data);
  },

  async update(
    id: string,
    patch: { name?: string; is_active?: boolean; is_primary?: boolean }
  ): Promise<NotificationEmailRecord> {
    const nextPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) nextPatch.name = patch.name;
    if (patch.is_active !== undefined) nextPatch.is_active = patch.is_active;
    if (patch.is_primary !== undefined) nextPatch.is_primary = patch.is_primary;
    const { data, error } = await supabase
      .from("order_notification_emails")
      .update(nextPatch)
      .eq("id", id)
      .select("id, email, name, is_active, is_primary, created_at, updated_at")
      .single();
    if (error) throw error;
    return mapNotificationEmail(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("order_notification_emails").delete().eq("id", id);
    if (error) throw error;
  },

  async clearPrimary(): Promise<void> {
    const { error } = await supabase
      .from("order_notification_emails")
      .update({ is_primary: false })
      .eq("is_primary", true);
    if (error) throw error;
  }
};

export const productImageRepository = {
  async listByProductId(productId: string): Promise<ProductImageRecord[]> {
    const { data, error } = await supabase
      .from("product_images")
      .select("id, product_id, storage_path, image_url, alt_text, sort_order, is_primary, created_at")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProductImage);
  },

  async create(input: {
    product_id: string;
    storage_path: string;
    image_url: string;
    sort_order: number;
    is_primary: boolean;
    alt_text?: string | null;
  }): Promise<ProductImageRecord> {
    const { data, error } = await supabase
      .from("product_images")
      .insert({
        product_id: input.product_id,
        storage_path: input.storage_path,
        image_url: input.image_url,
        sort_order: input.sort_order,
        is_primary: input.is_primary,
        alt_text: input.alt_text ?? null
      })
      .select("id, product_id, storage_path, image_url, alt_text, sort_order, is_primary, created_at")
      .single();
    if (error) throw error;
    return mapProductImage(data);
  },

  async getById(productId: string, imageId: string): Promise<ProductImageRecord | null> {
    const { data, error } = await supabase
      .from("product_images")
      .select("id, product_id, storage_path, image_url, alt_text, sort_order, is_primary, created_at")
      .eq("product_id", productId)
      .eq("id", imageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapProductImage(data);
  },

  async setPrimary(productId: string, imageId: string): Promise<void> {
    const { error: resetError } = await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId)
      .eq("is_primary", true);
    if (resetError) throw resetError;

    const { error } = await supabase
      .from("product_images")
      .update({ is_primary: true })
      .eq("product_id", productId)
      .eq("id", imageId);
    if (error) throw error;
  },

  async delete(productId: string, imageId: string): Promise<void> {
    const { error } = await supabase
      .from("product_images")
      .delete()
      .eq("product_id", productId)
      .eq("id", imageId);
    if (error) throw error;
  },

  async setProductPrimaryImage(productId: string, imageUrl: string | null): Promise<void> {
    const { error } = await supabase.from("products").update({ image_url: imageUrl }).eq("id", productId);
    if (error) throw error;
  }
};

export const productTemplateImageRepository = {
  async listByTemplateId(templateId: string): Promise<ProductTemplateImageRecord[]> {
    const { data, error } = await supabase
      .from("product_template_images")
      .select("id, template_id, storage_path, image_url, alt_text, sort_order, is_primary, created_at")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProductTemplateImage);
  },

  async create(input: {
    template_id: string;
    storage_path: string;
    image_url: string;
    sort_order: number;
    is_primary: boolean;
    alt_text?: string | null;
  }): Promise<ProductTemplateImageRecord> {
    const { data, error } = await supabase
      .from("product_template_images")
      .insert({
        template_id: input.template_id,
        storage_path: input.storage_path,
        image_url: input.image_url,
        sort_order: input.sort_order,
        is_primary: input.is_primary,
        alt_text: input.alt_text ?? null
      })
      .select("id, template_id, storage_path, image_url, alt_text, sort_order, is_primary, created_at")
      .single();
    if (error) throw error;
    return mapProductTemplateImage(data);
  },

  async getById(templateId: string, imageId: string): Promise<ProductTemplateImageRecord | null> {
    const { data, error } = await supabase
      .from("product_template_images")
      .select("id, template_id, storage_path, image_url, alt_text, sort_order, is_primary, created_at")
      .eq("template_id", templateId)
      .eq("id", imageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapProductTemplateImage(data);
  },

  async setPrimary(templateId: string, imageId: string): Promise<void> {
    const { error: resetError } = await supabase
      .from("product_template_images")
      .update({ is_primary: false })
      .eq("template_id", templateId)
      .eq("is_primary", true);
    if (resetError) throw resetError;

    const { error } = await supabase
      .from("product_template_images")
      .update({ is_primary: true })
      .eq("template_id", templateId)
      .eq("id", imageId);
    if (error) throw error;
  },

  async delete(templateId: string, imageId: string): Promise<void> {
    const { error } = await supabase
      .from("product_template_images")
      .delete()
      .eq("template_id", templateId)
      .eq("id", imageId);
    if (error) throw error;
  },

  async setTemplatePrimaryImage(templateId: string, imageUrl: string | null): Promise<void> {
    const { error } = await supabase.from("product_templates").update({ image_url: imageUrl }).eq("id", templateId);
    if (error) throw error;
  }
};

export async function copyTemplateImagesToProduct(
  templateId: string,
  productId: string,
  bucket: string
): Promise<void> {
  const existing = await productImageRepository.listByProductId(productId);
  if (existing.length > 0) return;

  const templateImages = await productTemplateImageRepository.listByTemplateId(templateId);
  if (templateImages.length === 0) return;

  let nextSortOrder = 0;
  let primaryImageId: string | null = null;
  let primaryImageUrl: string | null = null;
  const hasTemplatePrimary = templateImages.some((image) => image.is_primary);

  for (const [index, templateImage] of templateImages.entries()) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(templateImage.storage_path);
    if (downloadError) throw downloadError;

    const ext = templateImage.storage_path.split(".").pop() ?? "jpg";
    const imageId = randomUUID();
    const storagePath = `products/${productId}/${imageId}.${ext}`;
    const buffer = Buffer.from(await fileData.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType: fileData.type || "image/jpeg",
      upsert: false
    });
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl }
    } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const isPrimary = templateImage.is_primary || (!hasTemplatePrimary && index === 0);
    const image = await productImageRepository.create({
      product_id: productId,
      storage_path: storagePath,
      image_url: publicUrl,
      sort_order: nextSortOrder,
      is_primary: isPrimary,
      alt_text: templateImage.alt_text
    });
    if (isPrimary) {
      primaryImageId = image.id;
      primaryImageUrl = image.image_url;
    }
    nextSortOrder += 1;
  }

  const copied = await productImageRepository.listByProductId(productId);
  const primary = copied.find((image) => image.id === primaryImageId) ?? copied.find((image) => image.is_primary) ?? copied[0];
  if (!primary) return;

  if (!primary.is_primary) {
    await productImageRepository.setPrimary(productId, primary.id);
  }
  await productImageRepository.setProductPrimaryImage(productId, primary.image_url);
}

export const orderRepository = {
  async getByIdempotencyKey(key?: string): Promise<OrderRecord | null> {
    if (!key) return null;
    const { data, error } = await supabase.from("orders").select("*").eq("idempotency_key", key).single();
    if (error) return null;
    return data as OrderRecord;
  },

  async createOrder(order: OrderInsertInput, items: OrderItemInsertInput[]) {
    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert(order)
      .select("*")
      .single();

    if (orderError || !orderRow) {
      throw orderError ?? new Error("Unable to create order.");
    }

    const orderItemsPayload = items.map((item) => ({
      order_id: orderRow.id,
      ...item
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItemsPayload);
    if (itemsError) {
      throw itemsError;
    }

    await supabase.from("order_status_history").insert({
      order_id: orderRow.id,
      previous_status: null,
      next_status: order.status,
      note: "Order created."
    });

    return orderRow as OrderRecord;
  },

  async listOrders(): Promise<OrderRecord[]> {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", {
      ascending: false
    });
    if (error) throw error;
    return (data ?? []) as OrderRecord[];
  },

  async getOrderDetail(orderId: string): Promise<{
    order: OrderRecord | null;
    items: OrderItemRecord[];
    history: any[];
  }> {
    const [{ data: order, error: orderErr }, { data: items, error: itemsErr }, { data: history, error: histErr }] =
      await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).single(),
        supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
        supabase
          .from("order_status_history")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true })
      ]);
    if (orderErr) return { order: null, items: [], history: [] };
    if (itemsErr || histErr) throw itemsErr ?? histErr;
    return { order: order as OrderRecord, items: (items ?? []) as OrderItemRecord[], history: history ?? [] };
  },

  async updateOrder(
    orderId: string,
    payload: {
      order: Partial<OrderInsertInput>;
      items: OrderItemInsertInput[];
      note?: string;
    }
  ): Promise<{ order: OrderRecord; items: OrderItemRecord[] }> {
    const { data: currentOrder, error: currentError } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    if (currentError || !currentOrder) {
      throw new Error("Order not found.");
    }

    const { error: deleteItemsError } = await supabase.from("order_items").delete().eq("order_id", orderId);
    if (deleteItemsError) throw deleteItemsError;

    const itemsPayload = payload.items.map((item) => ({ order_id: orderId, ...item }));
    const { data: insertedItems, error: insertItemsError } = await supabase
      .from("order_items")
      .insert(itemsPayload)
      .select("*");
    if (insertItemsError) throw insertItemsError;

    const { data: updatedOrder, error: updateOrderError } = await supabase
      .from("orders")
      .update(payload.order)
      .eq("id", orderId)
      .select("*")
      .single();
    if (updateOrderError || !updatedOrder) throw updateOrderError ?? new Error("Unable to update order.");

    const nextStatus = payload.order.status ?? currentOrder.status;
    if (currentOrder.status !== nextStatus || payload.note) {
      await supabase.from("order_status_history").insert({
        order_id: orderId,
        previous_status: currentOrder.status,
        next_status: nextStatus,
        note: payload.note ?? "Order edited manually."
      });
    }

    return { order: updatedOrder as OrderRecord, items: (insertedItems ?? []) as OrderItemRecord[] };
  },

  async updateStatus(orderId: string, nextStatus: string, note?: string): Promise<OrderRecord> {
    const { data: currentOrder, error: currentError } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    if (currentError || !currentOrder) {
      throw new Error("Order not found.");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId)
      .select("*")
      .single();
    if (error) throw error;

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      previous_status: currentOrder.status,
      next_status: nextStatus,
      note: note ?? null
    });

    return data as OrderRecord;
  }
};
