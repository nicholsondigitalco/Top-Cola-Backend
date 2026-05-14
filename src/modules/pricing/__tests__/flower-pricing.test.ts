import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../data/repositories.js", () => ({
  catalogRepository: {
    getProductsByIds: vi.fn()
  },
  pricingRepository: {
    getRulesByPricingGroupIds: vi.fn()
  },
  promoRepository: {
    getByCode: vi.fn()
  }
}));

import { catalogRepository, pricingRepository, promoRepository } from "../../data/repositories.js";
import { PricingEngine } from "../pricing.engine.js";

describe("Flower pricing", () => {
  const engine = new PricingEngine();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(promoRepository.getByCode).mockResolvedValue(null);
  });

  it("aggregates grams within shelf and picks lower threshold for in-between quantities", async () => {
    vi.mocked(catalogRepository.getProductsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000101",
        sku: "FLOW-PREMIUM-1",
        name: "Premium Flower A",
        description: "",
        image_url: null,
        base_price: 10,
        category_slug: "flower",
        category_name: "Flower",
        pricing_group_id: "flower-premium-group",
        pricing_group_slug: "flower_premium",
        pricing_group_name: "Flower Premium",
        active: true
      },
      {
        id: "00000000-0000-0000-0000-000000000102",
        sku: "FLOW-PREMIUM-2",
        name: "Premium Flower B",
        description: "",
        image_url: null,
        base_price: 10,
        category_slug: "flower",
        category_name: "Flower",
        pricing_group_id: "flower-premium-group",
        pricing_group_slug: "flower_premium",
        pricing_group_name: "Flower Premium",
        active: true
      }
    ]);

    vi.mocked(pricingRepository.getRulesByPricingGroupIds).mockResolvedValue([
      {
        id: "flower-rule",
        slug: "flower-rule",
        name: "Flower Rule",
        pricing_group_id: "flower-premium-group",
        metric: "grams",
        aggregation: "by_pricing_group",
        tiers: [
          { min: 1, adjustment_type: "none", adjustment_value: 0 },
          { min: 4, adjustment_type: "percent", adjustment_value: 12.5 },
          { min: 8, adjustment_type: "percent", adjustment_value: 12.5 },
          { min: 16, adjustment_type: "percent", adjustment_value: 25 },
          { min: 32, adjustment_type: "percent", adjustment_value: 37.5 },
          { min: 40, adjustment_type: "percent", adjustment_value: 37.5 }
        ],
        constraints: {
          allowed_quantities: [1, 4, 8, 16, 32, 40]
        }
      }
    ]);

    const quote = await engine.quote({
      items: [
        { productId: "00000000-0000-0000-0000-000000000101", quantity: 8 },
        { productId: "00000000-0000-0000-0000-000000000102", quantity: 4 }
      ]
    });

    expect(quote.groups[0].metric_total).toBe(12);
    expect(quote.groups[0].tier_min).toBe(8);
    expect(quote.subtotal).toBe(120);
    expect(quote.volumeDiscount).toBe(15);
    expect(quote.total).toBe(105);
  });

  it("enforces smalls minimum checkout grams", async () => {
    vi.mocked(catalogRepository.getProductsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000201",
        sku: "FLOW-SMALL-1",
        name: "Smalls",
        description: "",
        image_url: null,
        base_price: 3.125,
        category_slug: "flower",
        category_name: "Flower",
        pricing_group_id: "flower-smalls-group",
        pricing_group_slug: "flower_smalls",
        pricing_group_name: "Flower Smalls",
        active: true
      }
    ]);

    vi.mocked(pricingRepository.getRulesByPricingGroupIds).mockResolvedValue([
      {
        id: "flower-smalls-rule",
        slug: "flower-smalls-rule",
        name: "Flower Smalls Rule",
        pricing_group_id: "flower-smalls-group",
        metric: "grams",
        aggregation: "by_pricing_group",
        tiers: [{ min: 16, adjustment_type: "none", adjustment_value: 0 }],
        constraints: {
          allowed_quantities: [1, 4, 8, 16, 32, 40],
          min_checkout_grams: 16
        }
      }
    ]);

    await expect(
      engine.quote({
        items: [{ productId: "00000000-0000-0000-0000-000000000201", quantity: 8 }]
      })
    ).rejects.toThrow("requires at least 16 grams");
  });
});
