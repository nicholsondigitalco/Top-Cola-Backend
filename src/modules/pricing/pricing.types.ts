export type ProductCategory = "vapes" | "edibles" | "joints" | "flower" | "other";

export type TierAdjustmentType =
  | "none"
  | "percent"
  | "fixed_per_unit"
  | "fixed_total"
  | "multiplier";

export interface PricingTier {
  min: number;
  adjustment_type: TierAdjustmentType;
  adjustment_value: number;
}

export interface PricingRuleConstraints {
  allowed_quantities?: number[];
  min_checkout_grams?: number;
}

export interface PricingRule {
  id: string;
  pricing_group_id: string;
  metric: "units" | "grams";
  aggregation: "by_pricing_group";
  tiers: PricingTier[];
  constraints: PricingRuleConstraints;
}

export interface Product {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  image_url: string | null;
  base_price: number;
  category_slug: ProductCategory;
  pricing_group_id: string;
  pricing_group_slug: string;
  active: boolean;
}

export interface QuoteItemInput {
  productId: string;
  quantity: number;
}

export interface PromoCode {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_subtotal: number;
  max_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export interface QuoteLine {
  product_id: string;
  product_name: string;
  pricing_group_slug: string;
  quantity: number;
  unit_base_price: number;
  line_subtotal: number;
  line_discount: number;
  line_total: number;
}

export interface GroupBreakdown {
  pricing_group_id: string;
  pricing_group_slug: string;
  metric_total: number;
  tier_min: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface QuoteResult {
  subtotal: number;
  volumeDiscount: number;
  promoDiscount: number;
  savings: number;
  total: number;
  items: QuoteLine[];
  groups: GroupBreakdown[];
}
