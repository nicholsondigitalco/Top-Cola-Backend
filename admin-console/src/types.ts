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
  status: "pending" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  subtotal: number;
  total: number;
  savings: number;
  created_at: string;
}

export interface OrderMetrics {
  totalOrders: number;
  pendingOrders: number;
  byStatus: Record<string, number>;
}
