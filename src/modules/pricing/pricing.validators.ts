import { z } from "zod";

export const QuoteItemSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  quantity: z.number().positive()
});

export const QuoteRequestSchema = z.object({
  items: z.array(QuoteItemSchema).min(1),
  promoCode: z.string().trim().min(2).max(40).optional()
});

export const OrderRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(7).max(30),
  customerEmail: z.string().email().optional(),
  deliveryAddress: z.string().trim().min(5).max(500),
  deliveryInstructions: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  promoCode: z.string().trim().min(2).max(40).optional(),
  items: z.array(QuoteItemSchema).min(1)
});

export const ProductCreateSchema = z.object({
  sku: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  imageUrl: z.string().url().optional(),
  basePrice: z.number().nonnegative(),
  categorySlug: z.string().trim().min(2).max(80),
  pricingGroupSlug: z.string().trim().min(2).max(80).nullable().optional(),
  active: z.boolean().default(true)
});

export const ProductUpdateSchema = ProductCreateSchema.partial();

export const CategoryCreateSchema = z.object({
  slug: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120)
});

export const CategoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

export const PromoCreateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive(),
  minSubtotal: z.number().nonnegative().default(0),
  maxDiscount: z.number().positive().optional(),
  usageLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
  description: z.string().trim().max(500).optional()
});

export const PromoUpdateSchema = PromoCreateSchema.partial();

export const PricingRuleUpdateSchema = z.object({
  tiers: z.array(
    z.object({
      min: z.number().nonnegative(),
      adjustment_type: z.enum([
        "none",
        "percent",
        "fixed_per_unit"
      ]),
      adjustment_value: z.number().nonnegative()
    })
  ),
  constraints: z.record(z.string(), z.unknown()).default({})
});

export const PricingRuleCreateSchema = z.object({
  slug: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  pricingGroupId: z.string().trim().min(2).max(120),
  metric: z.enum(["units", "grams"]),
  tiers: z.array(
    z.object({
      min: z.number().nonnegative(),
      adjustment_type: z.enum(["none", "percent", "fixed_per_unit"]),
      adjustment_value: z.number().nonnegative()
    })
  ),
  constraints: z.record(z.string(), z.unknown()).default({})
});

export const AdminLoginSchema = z.object({
  password: z.string().min(1)
});

export const AdminOrderStatusSchema = z.object({
  status: z.enum(["pending", "out_for_delivery", "complete", "cancelled"]),
  note: z.string().max(500).optional()
});

export const AdminMinimumOrderSchema = z.object({
  minOrderAmount: z.number().nonnegative()
});
