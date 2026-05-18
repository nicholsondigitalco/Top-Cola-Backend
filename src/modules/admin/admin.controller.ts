import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
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
  notificationEmailRepository,
  orderRepository,
  orderSettingsRepository,
  productImageRepository,
  pricingRepository,
  promoRepository
} from "../data/repositories.js";
import {
  AdminNotificationEmailCreateSchema,
  AdminNotificationEmailUpdateSchema,
  AdminOrderEditSchema,
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
import { supabase } from "../../lib/supabase.js";
import { pricingEngine } from "../pricing/pricing.engine.js";

export const adminRouter = Router();
const PRODUCT_IMAGE_BUCKET = "product-images";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed."));
      return;
    }
    cb(null, true);
  }
});

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
      variations: payload.variations,
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
      variations: payload.variations,
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

adminRouter.get("/admin/products/:productId/images", async (req, res, next) => {
  try {
    const productId = String(req.params.productId);
    const images = await productImageRepository.listByProductId(productId);
    res.json({ images });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/admin/products/:productId/images",
  upload.array("images", 12),
  async (req, res, next) => {
    try {
      const productId = String(req.params.productId);
      const product = await catalogRepository.getProductById(productId);
      if (!product) {
        res.status(404).json({ error: "Product not found." });
        return;
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: "Please upload at least one image." });
        return;
      }

      const existing = await productImageRepository.listByProductId(productId);
      let nextSortOrder =
        existing.length > 0 ? Math.max(...existing.map((image) => image.sort_order)) + 1 : 0;
      const created = [];
      let selectedPrimaryUrl: string | null = null;

      for (const [index, file] of files.entries()) {
        const ext = file.mimetype.split("/")[1] ?? "jpg";
        const imageId = randomUUID();
        const storagePath = `products/${productId}/${imageId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl }
        } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(storagePath);
        const isPrimary = existing.length === 0 && index === 0;
        const image = await productImageRepository.create({
          product_id: productId,
          storage_path: storagePath,
          image_url: publicUrl,
          sort_order: nextSortOrder,
          is_primary: isPrimary
        });
        if (isPrimary) {
          selectedPrimaryUrl = image.image_url;
        }
        nextSortOrder += 1;
        created.push(image);
      }

      if (selectedPrimaryUrl) {
        await productImageRepository.setProductPrimaryImage(productId, selectedPrimaryUrl);
      }

      res.status(201).json({ images: created });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.patch("/admin/products/:productId/images/:imageId/primary", async (req, res, next) => {
  try {
    const productId = String(req.params.productId);
    const imageId = String(req.params.imageId);
    const image = await productImageRepository.getById(productId, imageId);
    if (!image) {
      res.status(404).json({ error: "Image not found." });
      return;
    }

    await productImageRepository.setPrimary(productId, imageId);
    await productImageRepository.setProductPrimaryImage(productId, image.image_url);
    const images = await productImageRepository.listByProductId(productId);
    res.json({ images });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/products/:productId/images/:imageId", async (req, res, next) => {
  try {
    const productId = String(req.params.productId);
    const imageId = String(req.params.imageId);
    const image = await productImageRepository.getById(productId, imageId);
    if (!image) {
      res.status(404).json({ error: "Image not found." });
      return;
    }

    const { error: storageError } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .remove([image.storage_path]);
    if (storageError) throw storageError;

    await productImageRepository.delete(productId, imageId);
    const remaining = await productImageRepository.listByProductId(productId);
    if (remaining.length === 0) {
      await productImageRepository.setProductPrimaryImage(productId, null);
      res.status(204).send();
      return;
    }

    const primary = remaining.find((item) => item.is_primary) ?? remaining[0];
    if (!primary.is_primary) {
      await productImageRepository.setPrimary(productId, primary.id);
    }
    await productImageRepository.setProductPrimaryImage(productId, primary.image_url);
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

adminRouter.patch("/admin/orders/:orderId", async (req, res, next) => {
  try {
    const payload = AdminOrderEditSchema.parse(req.body);
    const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
    const quoteInputItems = payload.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      variationId: item.variationId
    }));
    const quote = await pricingEngine.quote({ items: quoteInputItems });

    const productIds = [...new Set(quoteInputItems.map((item) => item.productId))];
    const productCosts = await catalogRepository.getProductCostsByIds(productIds);
    const costByProductId = new Map(productCosts.map((record) => [record.id, record.cogs_per_unit]));

    const customDiscount = roundCurrency(payload.customDiscount);
    const quoteTotal = roundCurrency(quote.total);
    const appliedCustomDiscount = Math.min(customDiscount, quoteTotal);
    const total = roundCurrency(quoteTotal - appliedCustomDiscount);
    const cogsTotal = roundCurrency(
      quoteInputItems.reduce(
        (sum, item) => sum + (costByProductId.get(item.productId) ?? 0) * item.quantity,
        0
      )
    );
    const grossProfit = roundCurrency(total - cogsTotal);
    const savings = roundCurrency(quote.savings + appliedCustomDiscount);

    const items = quote.items.map((line) => ({
      product_id: line.product_id,
      product_name_snapshot: line.product_name,
      quantity: line.quantity,
      unit_base_price: line.unit_base_price,
      line_subtotal: line.line_subtotal,
      line_discount: line.line_discount,
      line_total: line.line_total,
      cogs_per_unit: roundCurrency(costByProductId.get(line.product_id) ?? 0),
      line_cogs_total: roundCurrency((costByProductId.get(line.product_id) ?? 0) * line.quantity),
      pricing_group_slug: line.pricing_group_slug
    }));

    const pricingSnapshot = {
      subtotal: quote.subtotal,
      volumeDiscount: quote.volumeDiscount,
      promoDiscount: quote.promoDiscount,
      customDiscount: appliedCustomDiscount,
      savings,
      total,
      items: quote.items,
      groups: quote.groups
    };

    const result = await orderRepository.updateOrder(String(req.params.orderId), {
      order: {
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail ?? undefined,
        delivery_address: payload.deliveryAddress,
        delivery_instructions: payload.deliveryInstructions ?? undefined,
        payment_method: payload.paymentMethod,
        scheduled_delivery_time: payload.scheduledDeliveryTime ?? undefined,
        status: payload.status,
        subtotal: quote.subtotal,
        volume_discount: quote.volumeDiscount,
        promo_discount: quote.promoDiscount,
        custom_discount: appliedCustomDiscount,
        total,
        savings,
        cogs_total: cogsTotal,
        gross_profit: grossProfit,
        promo_code: undefined,
        pricing_snapshot: pricingSnapshot
      },
      items,
      note: payload.note
    });

    res.json(result);
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

adminRouter.get("/admin/settings/notification-emails", async (_req, res, next) => {
  try {
    const emails = await notificationEmailRepository.list();
    res.json({ emails });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/admin/settings/notification-emails", async (req, res, next) => {
  try {
    const payload = AdminNotificationEmailCreateSchema.parse(req.body);
    if (payload.isPrimary) {
      await notificationEmailRepository.clearPrimary();
    }
    const email = await notificationEmailRepository.create({
      email: payload.email,
      name: payload.name,
      is_active: payload.isActive,
      is_primary: payload.isPrimary
    });
    res.status(201).json({ email });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/settings/notification-emails/:emailId", async (req, res, next) => {
  try {
    const payload = AdminNotificationEmailUpdateSchema.parse(req.body);
    if (payload.isPrimary) {
      await notificationEmailRepository.clearPrimary();
    }
    const email = await notificationEmailRepository.update(String(req.params.emailId), {
      name: payload.name,
      is_active: payload.isActive,
      is_primary: payload.isPrimary
    });
    res.json({ email });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/settings/notification-emails/:emailId", async (req, res, next) => {
  try {
    await notificationEmailRepository.delete(String(req.params.emailId));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
