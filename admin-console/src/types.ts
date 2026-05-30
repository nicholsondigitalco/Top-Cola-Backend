export interface Product {
  id: string;
  sku: string | null;
  name: string;
  short_description: string;
  long_description: string;
  image_url: string | null;
  base_price: number;
  cogs_per_unit?: number;
  category_id: string;
  category_slug: string;
  category_name: string;
  pricing_group_id: string | null;
  pricing_group_slug: string | null;
  pricing_group_name: string | null;
  variations?: ProductVariation[];
  tags?: string[];
  gallery_images?: ProductImage[];
  primary_image_url?: string | null;
  avg_order_quantity?: number;
  avg_discount_per_unit?: number;
  avg_profit_margin_per_unit?: number;
  active: boolean;
  is_starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductVariation {
  id: string;
  name: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description?: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_subtotal: number;
  max_discount?: number | null;
  active: boolean;
  usage_limit: number | null;
  used_count: number;
}

export interface PricingRule {
  id: string;
  slug: string;
  name: string;
  pricing_group_id: string;
  metric: "units" | "grams";
  aggregation: string;
  tiers: PricingTier[];
  constraints: PricingConstraints;
}

export interface PricingTier {
  min: number;
  adjustment_type: "none" | "percent" | "fixed_per_unit";
  adjustment_value: number;
}

export interface PricingConstraints {
  allowed_quantities?: number[];
  min_checkout_grams?: number;
}

export interface OrderRecord {
  id: string;
  status: "pending" | "complete" | "cancelled";
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_instructions?: string | null;
  payment_method: "cash" | "zelle";
  scheduled_delivery_time?: string | null;
  subtotal: number;
  volume_discount?: number;
  promo_discount?: number;
  custom_discount?: number;
  total: number;
  savings: number;
  promo_code?: string | null;
  gross_profit?: number;
  pricing_snapshot?: {
    promoCode?: string;
    promoDiscount?: number;
    items?: Array<{
      product_id?: string;
      product_name?: string;
      quantity?: number;
      variation_id?: string;
      variation_name?: string;
    }>;
  };
  created_at: string;
}

export interface OrderDetailItem {
  id: string;
  order_id: string;
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
  created_at: string;
}

export interface OrderMetrics {
  totalOrders: number;
  pendingOrders: number;
  byStatus: Record<string, number>;
}

export interface OrderSettings {
  minOrderAmount: number;
  minDeliveryBufferMinutes: number;
}

export interface NotificationEmail {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  is_primary: boolean;
}
