import { orderRepository, promoRepository } from "../data/repositories.js";
import { emailService } from "../notifications/email.service.js";
import { pricingEngine } from "../pricing/pricing.engine.js";
import type { QuoteItemInput, QuoteResult } from "../pricing/pricing.types.js";

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  deliveryInstructions?: string;
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

    const created = await orderRepository.createOrder(
      {
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        customer_email: input.customerEmail,
        delivery_address: input.deliveryAddress,
        delivery_instructions: input.deliveryInstructions,
        status: "pending",
        subtotal: quote.subtotal,
        volume_discount: quote.volumeDiscount,
        promo_discount: quote.promoDiscount,
        total: quote.total,
        savings: quote.savings,
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
        pricing_group_slug: line.pricing_group_slug
      }))
    );

    if (input.promoCode) {
      await promoRepository.incrementUsage(input.promoCode);
    }

    await emailService.sendOrderNotification({
      orderId: created.id,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
      deliveryInstructions: input.deliveryInstructions,
      quote
    });

    return { order: created, quote };
  }
}

export const ordersService = new OrdersService();
