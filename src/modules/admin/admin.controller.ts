import { Router } from "express";
import {
  clearLoginFailures,
  enforceLoginRateLimit,
  isValidAdminPassword,
  issueAdminToken,
  recordLoginFailure,
  requireAdminAuth
} from "../../middleware/adminAuth.js";
import {
  catalogRepository,
  orderRepository,
  orderSettingsRepository,
  pricingRepository,
  promoRepository
} from "../data/repositories.js";
import {
  AdminMinimumOrderSchema,
  AdminLoginSchema,
  AdminOrderStatusSchema,
  CategoryCreateSchema,
  CategoryUpdateSchema,
  PricingRuleCreateSchema,
  PricingRuleUpdateSchema,
  ProductCreateSchema,
  ProductUpdateSchema,
  PromoCreateSchema,
  PromoUpdateSchema
} from "../pricing/pricing.validators.js";
import { orderStatusService } from "../orders/order-status.service.js";

export const adminRouter = Router();

adminRouter.post("/admin/login", async (req, res, next) => {
  try {
    const ip = req.ip ?? "unknown";
    if (!enforceLoginRateLimit(ip)) {
      res.status(429).json({ error: "Too many attempts. Please retry later." });
      return;
    }

    const payload = AdminLoginSchema.parse(req.body);
    const valid = await isValidAdminPassword(payload.password);
    if (!valid) {
      recordLoginFailure(ip);
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    clearLoginFailures(ip);
    res.json({ token: issueAdminToken() });
  } catch (error) {
    next(error);
  }
});

adminRouter.use(requireAdminAuth);

adminRouter.get("/admin/products", async (_req, res, next) => {
  try {
    res.json({ products: await catalogRepository.listProducts({}) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/categories", async (_req, res, next) => {
  try {
    res.json({ categories: await catalogRepository.listCategories() });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/admin/categories", async (req, res, next) => {
  try {
    const payload = CategoryCreateSchema.parse(req.body);
    const category = await catalogRepository.createCategory(payload);
    res.status(201).json({ category });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/categories/:categoryId", async (req, res, next) => {
  try {
    const payload = CategoryUpdateSchema.parse(req.body);
    const category = await catalogRepository.updateCategory(req.params.categoryId, payload);
    res.json({ category });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/categories/:categoryId", async (req, res, next) => {
  try {
    await catalogRepository.deleteCategory(req.params.categoryId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/admin/products", async (req, res, next) => {
  try {
    const payload = ProductCreateSchema.parse(req.body);
    const product = await catalogRepository.createProduct({
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      image_url: payload.imageUrl,
      base_price: payload.basePrice,
      category_slug: payload.categorySlug,
      pricing_group_slug: payload.pricingGroupSlug,
      active: payload.active
    });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/products/:productId", async (req, res, next) => {
  try {
    const payload = ProductUpdateSchema.parse(req.body);
    const product = await catalogRepository.updateProduct(req.params.productId, {
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      image_url: payload.imageUrl,
      base_price: payload.basePrice,
      category_slug: payload.categorySlug,
      pricing_group_slug: payload.pricingGroupSlug,
      active: payload.active
    });
    res.json({ product });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/products/:productId", async (req, res, next) => {
  try {
    await catalogRepository.deleteProduct(req.params.productId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/promos", async (_req, res, next) => {
  try {
    res.json({ promos: await promoRepository.listPromos() });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/admin/promos", async (req, res, next) => {
  try {
    const payload = PromoCreateSchema.parse(req.body);
    const promo = await promoRepository.createPromo({
      code: payload.code,
      description: payload.description,
      discount_type: payload.discountType,
      discount_value: payload.discountValue,
      min_subtotal: payload.minSubtotal,
      max_discount: payload.maxDiscount,
      usage_limit: payload.usageLimit,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      active: payload.active
    });
    res.status(201).json({ promo });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/promos/:promoId", async (req, res, next) => {
  try {
    const payload = PromoUpdateSchema.parse(req.body);
    const promo = await promoRepository.updatePromo(req.params.promoId, {
      code: payload.code,
      description: payload.description,
      discount_type: payload.discountType,
      discount_value: payload.discountValue,
      min_subtotal: payload.minSubtotal,
      max_discount: payload.maxDiscount,
      usage_limit: payload.usageLimit,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      active: payload.active
    });
    res.json({ promo });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/promos/:promoId", async (req, res, next) => {
  try {
    await promoRepository.deletePromo(req.params.promoId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/pricing-rules", async (_req, res, next) => {
  try {
    res.json({ pricingRules: await pricingRepository.listRules() });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/admin/pricing-rules", async (req, res, next) => {
  try {
    const payload = PricingRuleCreateSchema.parse(req.body);
    const pricingRule = await pricingRepository.createRule({
      slug: payload.slug,
      name: payload.name,
      pricing_group_id: payload.pricingGroupId,
      metric: payload.metric,
      tiers: payload.tiers,
      constraints: payload.constraints
    });
    res.status(201).json({ pricingRule });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/pricing-rules/:ruleId", async (req, res, next) => {
  try {
    const payload = PricingRuleUpdateSchema.parse(req.body);
    const pricingRule = await pricingRepository.updateRule(req.params.ruleId, payload);
    res.json({ pricingRule });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/orders", async (_req, res, next) => {
  try {
    res.json({ orders: await orderRepository.listOrders() });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/orders/:orderId", async (req, res, next) => {
  try {
    const detail = await orderRepository.getOrderDetail(req.params.orderId);
    if (!detail.order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/orders/:orderId/status", async (req, res, next) => {
  try {
    const payload = AdminOrderStatusSchema.parse(req.body);
    const order = await orderStatusService.update(req.params.orderId, payload.status, payload.note);
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/metrics/orders", async (_req, res, next) => {
  try {
    const orders = await orderRepository.listOrders();
    const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    }, {});
    res.json({
      totalOrders: orders.length,
      pendingOrders: byStatus.pending ?? 0,
      byStatus
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/settings/order-minimum", async (_req, res, next) => {
  try {
    const settings = await orderSettingsRepository.get();
    res.json({
      minOrderAmount: settings.min_order_amount,
      minDeliveryBufferMinutes: settings.min_delivery_buffer_minutes
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/settings/order-minimum", async (req, res, next) => {
  try {
    const payload = AdminMinimumOrderSchema.parse(req.body);
    const settings = await orderSettingsRepository.update(
      payload.minOrderAmount,
      payload.minDeliveryBufferMinutes
    );
    res.json({
      minOrderAmount: settings.min_order_amount,
      minDeliveryBufferMinutes: settings.min_delivery_buffer_minutes
    });
  } catch (error) {
    next(error);
  }
});
