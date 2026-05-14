export interface Product {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  image_url: string | null;
  base_price: number;
  category_slug: string;
  category_name: string;
  pricing_group_slug: string | null;
  pricing_group_name: string | null;
  avg_order_quantity?: number;
  avg_discount_per_unit?: number;
  avg_profit_margin_per_unit?: number;
  active: boolean;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_subtotal: number;
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
  status: "pending" | "out_for_delivery" | "complete" | "cancelled";
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_instructions?: string | null;
  payment_method: "cash" | "zelle";
  scheduled_delivery_time?: string | null;
  subtotal: number;
  total: number;
  savings: number;
  gross_profit?: number;
  pricing_snapshot?: {
    items?: Array<{
      product_name?: string;
      quantity?: number;
    }>;
  };
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
