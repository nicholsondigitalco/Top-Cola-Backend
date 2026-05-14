import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../data/repositories.js", () => ({
  catalogRepository: {
    getProductCostsByIds: vi.fn()
  },
  orderSettingsRepository: {
    get: vi.fn()
  },
  orderRepository: {
    getByIdempotencyKey: vi.fn(),
    createOrder: vi.fn()
  },
  promoRepository: {
    incrementUsage: vi.fn()
  }
}));

vi.mock("../../pricing/pricing.engine.js", () => ({
  pricingEngine: {
    quote: vi.fn()
  }
}));

import {
  catalogRepository,
  orderRepository,
  orderSettingsRepository,
  promoRepository
} from "../../data/repositories.js";
import { pricingEngine } from "../../pricing/pricing.engine.js";
import { OrdersService } from "../orders.service.js";

describe("OrdersService createOrder", () => {
  const service = new OrdersService();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates an order, stores line items, and increments promo usage", async () => {
    vi.mocked(orderRepository.getByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(orderSettingsRepository.get).mockResolvedValue({ min_order_amount: 0 });
    vi.mocked(catalogRepository.getProductCostsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000009999",
        cogs_per_unit: 20
      }
    ]);
    vi.mocked(pricingEngine.quote).mockResolvedValue({
      subtotal: 100,
      volumeDiscount: 20,
      promoDiscount: 10,
      savings: 30,
      total: 70,
      groups: [],
      items: [
        {
          product_id: "00000000-0000-0000-0000-000000009999",
          product_name: "Sample Product",
          pricing_group_slug: "vape_default",
          quantity: 2,
          unit_base_price: 50,
          line_subtotal: 100,
          line_discount: 30,
          line_total: 70
        }
      ]
    });
    vi.mocked(orderRepository.createOrder).mockResolvedValue({
      id: "order-1"
    } as any);

    const result = await service.createOrder({
      customerName: "Test Customer",
      customerPhone: "123-123-1234",
      customerEmail: "test@example.com",
      deliveryAddress: "123 Main St",
      deliveryInstructions: "Leave at door",
      idempotencyKey: "idem-key-1",
      promoCode: "SAVE10",
      items: [{ productId: "00000000-0000-0000-0000-000000009999", quantity: 2 }]
    });

    expect(result.order.id).toBe("order-1");
    expect(orderRepository.createOrder).toHaveBeenCalledTimes(1);
    expect(promoRepository.incrementUsage).toHaveBeenCalledWith("SAVE10");
  });
});
