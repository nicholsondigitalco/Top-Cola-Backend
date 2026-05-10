import { supabase } from "../../lib/supabase.js";
import type { PricingRule, Product, PromoCode } from "../pricing/pricing.types.js";

export interface OrderInsertInput {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_instructions?: string;
  status: "pending" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";
  subtotal: number;
  volume_discount: number;
  promo_discount: number;
  total: number;
  savings: number;
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
  pricing_group_slug: string;
}

export interface OrderRecord {
  id: string;
  status: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_instructions: string | null;
  subtotal: number;
  volume_discount: number;
  promo_discount: number;
  total: number;
  savings: number;
  promo_code: string | null;
  pricing_snapshot?: unknown;
}

const mapProduct = (row: any): Product => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  description: row.description,
  image_url: row.image_url,
  base_price: Number(row.base_price),
  category_slug: row.product_categories.slug,
  pricing_group_id: row.pricing_group_id,
  pricing_group_slug: row.pricing_groups.slug,
  active: row.active
});

const mapRule = (row: any): PricingRule => ({
  id: row.id,
  pricing_group_id: row.pricing_group_id,
  metric: row.metric,
  aggregation: row.aggregation,
  tiers: row.tiers,
  constraints: row.constraints ?? {}
});

const mapPromo = (row: any): PromoCode => ({
  id: row.id,
  code: row.code,
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

const sanitizeIdentifier = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

export const catalogRepository = {
  async listProducts(filters: { categorySlug?: string; active?: boolean } = {}): Promise<Product[]> {
    let query = supabase
      .from("products")
      .select(
        `
        id, sku, name, description, image_url, base_price, pricing_group_id, active,
        product_categories!inner(slug),
        pricing_groups!inner(slug)
      `
      )
      .order("created_at", { ascending: false });

    if (filters.active !== undefined) {
      query = query.eq("active", filters.active);
    }

    if (filters.categorySlug) {
      query = query.eq("product_categories.slug", filters.categorySlug);
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
      .select(
        `
        id, sku, name, description, image_url, base_price, pricing_group_id, active,
        product_categories!inner(slug),
        pricing_groups!inner(slug)
      `
      )
      .in("id", productIds)
      .eq("active", true);
    if (error) {
      throw error;
    }
    return (data ?? []).map(mapProduct);
  },

  async createProduct(payload: {
    sku?: string;
    name: string;
    description: string;
    image_url?: string;
    base_price: number;
    category_slug: string;
    pricing_group_slug: string;
    active: boolean;
  }): Promise<Product> {
    const [{ data: category, error: categoryError }, { data: pricingGroup, error: groupError }] =
      await Promise.all([
        supabase.from("product_categories").select("id").eq("slug", payload.category_slug).single(),
        supabase.from("pricing_groups").select("id").eq("slug", payload.pricing_group_slug).single()
      ]);
    if (categoryError || groupError || !category || !pricingGroup) {
      throw new Error("Invalid category or pricing group.");
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
        description: payload.description,
        image_url: payload.image_url,
        base_price: payload.base_price,
        category_id: category.id,
        pricing_group_id: pricingGroup.id,
        active: payload.active
      })
      .select(
        `
        id, sku, name, description, image_url, base_price, pricing_group_id, active,
        product_categories!inner(slug),
        pricing_groups!inner(slug)
      `
      )
      .single();

    if (error) {
      throw error;
    }
    return mapProduct(data);
  },

  async updateProduct(productId: string, patch: Record<string, unknown>): Promise<Product> {
    const nextPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) nextPatch.name = patch.name;
    if (patch.description !== undefined) nextPatch.description = patch.description;
    if (patch.image_url !== undefined) nextPatch.image_url = patch.image_url;
    if (patch.base_price !== undefined) nextPatch.base_price = patch.base_price;
    if (patch.active !== undefined) nextPatch.active = patch.active;

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
      const { data: group, error } = await supabase
        .from("pricing_groups")
        .select("id")
        .eq("slug", patch.pricing_group_slug)
        .single();
      if (error || !group) throw new Error("Invalid pricing group.");
      nextPatch.pricing_group_id = group.id;
    }

    const { data, error } = await supabase
      .from("products")
      .update(nextPatch)
      .eq("id", productId)
      .select(
        `
        id, sku, name, description, image_url, base_price, pricing_group_id, active,
        product_categories!inner(slug),
        pricing_groups!inner(slug)
      `
      )
      .single();
    if (error) throw error;
    return mapProduct(data);
  },

  async deleteProduct(productId: string): Promise<void> {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) throw error;
  }
};

export const pricingRepository = {
  async getRulesByPricingGroupIds(pricingGroupIds: string[]): Promise<PricingRule[]> {
    const { data, error } = await supabase
      .from("pricing_rules")
      .select("id, pricing_group_id, metric, aggregation, tiers, constraints")
      .in("pricing_group_id", pricingGroupIds);

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapRule);
  },

  async listRules(): Promise<PricingRule[]> {
    const { data, error } = await supabase
      .from("pricing_rules")
      .select("id, pricing_group_id, metric, aggregation, tiers, constraints");
    if (error) throw error;
    return (data ?? []).map(mapRule);
  },

  async updateRule(ruleId: string, update: { tiers: unknown; constraints: unknown }): Promise<PricingRule> {
    const { data, error } = await supabase
      .from("pricing_rules")
      .update(update)
      .eq("id", ruleId)
      .select("id, pricing_group_id, metric, aggregation, tiers, constraints")
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
    items: any[];
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
    return { order: order as OrderRecord, items: items ?? [], history: history ?? [] };
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
