import {
  catalogRepository,
  orderRepository,
  orderSettingsRepository,
  promoRepository
} from "../data/repositories.js";
import { pricingEngine } from "../pricing/pricing.engine.js";
import type { QuoteItemInput, QuoteResult } from "../pricing/pricing.types.js";

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  deliveryInstructions?: string;
  paymentMethod: "cash" | "zelle";
  scheduledDeliveryTime?: string;
  idempotencyKey?: string;
  promoCode?: string;
  items: QuoteItemInput[];
}

export class OrdersService {
  async createOrder(input: CreateOrderInput): Promise<{ order: any; quote: QuoteResult }> {
    const existing = await orderRepository.getByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { order: existing, quote: existing.pricing_snapshot as QuoteResult };
    }

    const quote = await pricingEngine.quote({ items: input.items, promoCode: input.promoCode });
    const settings = await orderSettingsRepository.get();
    if (quote.total < settings.min_order_amount) {
      throw new Error(`Minimum order is $${settings.min_order_amount.toFixed(2)}.`);
    }
    if (input.scheduledDeliveryTime) {
      const scheduled = new Date(input.scheduledDeliveryTime);
      if (Number.isNaN(scheduled.getTime())) {
        throw new Error("Scheduled delivery time must be a valid ISO datetime.");
      }

      const minAllowedTime = Date.now() + settings.min_delivery_buffer_minutes * 60 * 1000;
      if (scheduled.getTime() < minAllowedTime) {
        throw new Error(
          `Scheduled delivery must be at least ${settings.min_delivery_buffer_minutes} minutes from now.`
        );
      }
    }

    const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const productCosts = await catalogRepository.getProductCostsByIds(productIds);
    const costByProductId = new Map(productCosts.map((record) => [record.id, record.cogs_per_unit]));
    const cogsTotal = roundCurrency(
      input.items.reduce((sum, item) => sum + (costByProductId.get(item.productId) ?? 0) * item.quantity, 0)
    );
    const grossProfit = roundCurrency(quote.total - cogsTotal);

    const created = await orderRepository.createOrder(
      {
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        customer_email: input.customerEmail,
        delivery_address: input.deliveryAddress,
        delivery_instructions: input.deliveryInstructions,
        payment_method: input.paymentMethod,
        scheduled_delivery_time: input.scheduledDeliveryTime,
        status: "pending",
        subtotal: quote.subtotal,
        volume_discount: quote.volumeDiscount,
        promo_discount: quote.promoDiscount,
        total: quote.total,
        savings: quote.savings,
        cogs_total: cogsTotal,
        gross_profit: grossProfit,
        pricing_snapshot: quote,
        promo_code: input.promoCode,
        idempotency_key: input.idempotencyKey
      },
      quote.items.map((line) => ({
        product_id: line.product_id,
        product_name_snapshot: line.product_name,
        quantity: line.quantity,
        unit_base_price: line.unit_base_price,
        line_subtotal: line.line_subtotal,
        line_discount: line.line_discount,
        line_total: line.line_total,
        cogs_per_unit: costByProductId.get(line.product_id) ?? 0,
        line_cogs_total: roundCurrency((costByProductId.get(line.product_id) ?? 0) * line.quantity),
        pricing_group_slug: line.pricing_group_slug
      }))
    );

    if (input.promoCode) {
      await promoRepository.incrementUsage(input.promoCode);
    }

    return { order: created, quote };
  }
}

export const ordersService = new OrdersService();
