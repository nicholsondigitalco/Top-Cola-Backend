import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../data/repositories.js", () => ({
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

import { catalogRepository, pricingRepository, promoRepository } from "../data/repositories.js";
import { PricingEngine } from "./pricing.engine.js";

describe("PricingEngine", () => {
  const engine = new PricingEngine();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("applies vape fixed discount tiers", async () => {
    vi.mocked(catalogRepository.getProductsByIds).mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000001",
        sku: "VAPE-1",
        name: "Vape",
        short_description: "",
        long_description: "",
        image_url: null,
        base_price: 35,
        category_slug: "vapes",
        category_name: "Vapes",
        category_id: "vapes",
        pricing_group_id: "group-vape",
        pricing_group_slug: "vape_default",
        pricing_group_name: "Vape Default",
        active: true,
        is_starred: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z"
      }
    ]);
    vi.mocked(pricingRepository.getRulesByPricingGroupIds).mockResolvedValue([
      {
        id: "rule-vape",
        slug: "rule-vape",
        name: "Vape Rule",
        pricing_group_id: "group-vape",
        metric: "units",
        aggregation: "by_pricing_group",
        tiers: [
          { min: 1, adjustment_type: "none", adjustment_value: 0 },
          { min: 2, adjustment_type: "fixed_per_unit", adjustment_value: 5 },
          { min: 5, adjustment_type: "fixed_per_unit", adjustment_value: 10 }
        ],
        constraints: {}
      }
    ]);
    vi.mocked(promoRepository.getByCode).mockResolvedValue(null);

    const result = await engine.quote({
      items: [{ productId: "00000000-0000-0000-0000-000000000001", quantity: 5 }]
    });

    expect(result.subtotal).toBe(175);
    expect(result.volumeDiscount).toBe(50);
    expect(result.total).toBe(125);
  });
});
