export type ProductCategory = string;

export type TierAdjustmentType =
  | "none"
  | "percent"
  | "fixed_per_unit";

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
  slug: string;
  name: string;
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
  category_name: string;
  pricing_group_id: string | null;
  pricing_group_slug: string | null;
  pricing_group_name: string | null;
  avg_order_quantity?: number;
  avg_discount_per_unit?: number;
  avg_profit_margin_per_unit?: number;
  variations?: ProductVariation[];
  primary_image_url?: string | null;
  gallery_images?: ProductImage[];
  active: boolean;
}

export interface QuoteItemInput {
  productId: string;
  quantity: number;
  variationId?: string;
}

export interface ProductVariation {
  id: string;
  name: string;
}

export interface ProductImage {
  id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
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
  variation_id?: string;
  variation_name?: string;
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
