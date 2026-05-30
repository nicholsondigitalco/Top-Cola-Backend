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
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 10,
        category_slug: "flower",
        category_name: "Flower",
        category_id: "flower",
        pricing_group_id: "flower-premium-group",
        pricing_group_slug: "flower_premium",
        pricing_group_name: "Flower Premium",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
      },
      {
        id: "00000000-0000-0000-0000-000000000102",
        sku: "FLOW-PREMIUM-2",
        name: "Premium Flower B",
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 10,
        category_slug: "flower",
        category_name: "Flower",
        category_id: "flower",
        pricing_group_id: "flower-premium-group",
        pricing_group_slug: "flower_premium",
        pricing_group_name: "Flower Premium",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
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
        { productId: "00000000-0000-0000-0000-000000000102", quantity: 8 }
      ]
    });

    expect(quote.groups[0].metric_total).toBe(16);
    expect(quote.groups[0].tier_min).toBe(16);
    expect(quote.subtotal).toBe(160);
    expect(quote.volumeDiscount).toBe(40);
    expect(quote.total).toBe(120);
  });

  it("accepts collective quantity across products in the same pricing group", async () => {
    vi.mocked(catalogRepository.getProductsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000301",
        sku: "FLOW-SMALL-A",
        name: "Smalls A",
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 3.125,
        category_slug: "flower",
        category_name: "Flower",
        category_id: "flower",
        pricing_group_id: "flower-smalls-group",
        pricing_group_slug: "flower_smalls",
        pricing_group_name: "Flower Smalls",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
      },
      {
        id: "00000000-0000-0000-0000-000000000302",
        sku: "FLOW-SMALL-B",
        name: "Smalls B",
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 3.125,
        category_slug: "flower",
        category_name: "Flower",
        category_id: "flower",
        pricing_group_id: "flower-smalls-group",
        pricing_group_slug: "flower_smalls",
        pricing_group_name: "Flower Smalls",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
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
        tiers: [
          { min: 16, adjustment_type: "none", adjustment_value: 0 },
          { min: 32, adjustment_type: "percent", adjustment_value: 12.5 },
          { min: 40, adjustment_type: "percent", adjustment_value: 37.5 }
        ],
        constraints: {
          allowed_quantities: [1, 4, 8, 16, 32, 40]
        }
      }
    ]);

    const quote = await engine.quote({
      items: [
        { productId: "00000000-0000-0000-0000-000000000301", quantity: 20 },
        { productId: "00000000-0000-0000-0000-000000000302", quantity: 20 }
      ]
    });

    expect(quote.groups[0].metric_total).toBe(40);
    expect(quote.total).toBeGreaterThan(0);
  });

  it("rejects individual quantities when the collective total is not allowed", async () => {
    vi.mocked(catalogRepository.getProductsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000301",
        sku: "FLOW-SMALL-A",
        name: "Smalls A",
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 3.125,
        category_slug: "flower",
        category_name: "Flower",
        category_id: "flower",
        pricing_group_id: "flower-smalls-group",
        pricing_group_slug: "flower_smalls",
        pricing_group_name: "Flower Smalls",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
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
          allowed_quantities: [1, 4, 8, 16, 32, 40]
        }
      }
    ]);

    await expect(
      engine.quote({
        items: [{ productId: "00000000-0000-0000-0000-000000000301", quantity: 20 }]
      })
    ).rejects.toThrow("Quantity 20 is not permitted for flower_smalls");
  });

  it("enforces smalls minimum checkout grams", async () => {
    vi.mocked(catalogRepository.getProductsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000201",
        sku: "FLOW-SMALL-1",
        name: "Smalls",
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 3.125,
        category_slug: "flower",
        category_name: "Flower",
        category_id: "flower",
        pricing_group_id: "flower-smalls-group",
        pricing_group_slug: "flower_smalls",
        pricing_group_name: "Flower Smalls",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
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
