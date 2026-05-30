import { catalogRepository, pricingRepository, promoRepository } from "../data/repositories.js";
import type {
  GroupBreakdown,
  PricingRule,
  PricingTier,
  Product,
  QuoteItemInput,
  QuoteLine,
  QuoteResult
} from "./pricing.types.js";

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const applyTierDiscount = (subtotal: number, metricTotal: number, tier: PricingTier): number => {
  switch (tier.adjustment_type) {
    case "none":
      return 0;
    case "percent":
      return roundCurrency(subtotal * (tier.adjustment_value / 100));
    case "fixed_per_unit":
      return roundCurrency(metricTotal * tier.adjustment_value);
    default:
      return 0;
  }
};

const pickTier = (tiers: PricingTier[], metricTotal: number): PricingTier => {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  let chosen = sorted[0];
  for (const tier of sorted) {
    if (metricTotal >= tier.min) {
      chosen = tier;
    }
  }
  return chosen;
};

const validateConstraints = (rule: PricingRule, metricTotal: number, groupSlug: string) => {
  const { allowed_quantities: allowedQuantities, min_checkout_grams: minCheckoutGrams } = rule.constraints;
  if (allowedQuantities?.length) {
    if (!allowedQuantities.includes(metricTotal)) {
      throw new Error(
        `Quantity ${metricTotal} is not permitted for ${groupSlug}. Allowed: ${allowedQuantities.join(", ")}`
      );
    }
  }

  if (minCheckoutGrams && metricTotal < minCheckoutGrams) {
    throw new Error(
      `${groupSlug} requires at least ${minCheckoutGrams} grams in checkout (current: ${metricTotal}).`
    );
  }
};

interface GroupInput {
  product: Product;
  quantity: number;
  variationId?: string;
  variationName?: string;
}

const buildQuoteLines = (
  groupRows: GroupInput[],
  groupDiscount: number,
  groupSubtotal: number
): QuoteLine[] => {
  if (groupSubtotal <= 0) return [];
  return groupRows.map((entry) => {
    const lineSubtotal = roundCurrency(entry.product.base_price * entry.quantity);
    const proportionalDiscount = roundCurrency((lineSubtotal / groupSubtotal) * groupDiscount);
    const lineTotal = roundCurrency(lineSubtotal - proportionalDiscount);
    return {
      product_id: entry.product.id,
      product_name: entry.variationName
        ? `${entry.product.name} (${entry.variationName})`
        : entry.product.name,
      variation_id: entry.variationId,
      variation_name: entry.variationName,
      pricing_group_slug: entry.product.pricing_group_slug ?? "no_volume_discount",
      quantity: entry.quantity,
      unit_base_price: entry.product.base_price,
      line_subtotal: lineSubtotal,
      line_discount: proportionalDiscount,
      line_total: lineTotal
    };
  });
};

const assertPromoWindow = (startsAt: string | null, endsAt: string | null) => {
  const now = new Date();
  if (startsAt && now < new Date(startsAt)) {
    throw new Error("Promo code is not active yet.");
  }
  if (endsAt && now > new Date(endsAt)) {
    throw new Error("Promo code has expired.");
  }
};

export class PricingEngine {
  async quote(
    input: { items: QuoteItemInput[]; promoCode?: string },
    options: { ignoreRuleConstraints?: boolean } = {}
  ): Promise<QuoteResult> {
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await catalogRepository.getProductsByIds(productIds);
    const productMap = new Map(products.map((product) => [product.id, product]));

    if (products.length !== productIds.length) {
      throw new Error("One or more products are missing or inactive.");
    }

    const grouped = new Map<string, GroupInput[]>();
    const noDiscountRows: GroupInput[] = [];
    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Missing product ${item.productId}`);
      let variationName: string | undefined;
      if (item.variationId) {
        const selected = (product.variations ?? []).find((variation) => variation.id === item.variationId);
        if (!selected) {
          throw new Error(`Variation ${item.variationId} is not valid for ${product.name}.`);
        }
        variationName = selected.name;
      }
      if (!product.pricing_group_id) {
        noDiscountRows.push({
          product,
          quantity: item.quantity,
          variationId: item.variationId,
          variationName
        });
        continue;
      }
      const group = grouped.get(product.pricing_group_id) ?? [];
      group.push({
        product,
        quantity: item.quantity,
        variationId: item.variationId,
        variationName
      });
      grouped.set(product.pricing_group_id, group);
    }

    const rules = await pricingRepository.getRulesByPricingGroupIds([...grouped.keys()]);
    const ruleMap = new Map(rules.map((rule) => [rule.pricing_group_id, rule]));

    const quoteLines: QuoteLine[] = [];
    const groups: GroupBreakdown[] = [];

    let subtotal = 0;
    let volumeDiscount = 0;

    if (noDiscountRows.length > 0) {
      quoteLines.push(...buildQuoteLines(noDiscountRows, 0, noDiscountRows.reduce((sum, row) => sum + row.product.base_price * row.quantity, 0)));
      subtotal += noDiscountRows.reduce((sum, row) => sum + row.product.base_price * row.quantity, 0);
    }

    for (const [pricingGroupId, groupRows] of grouped.entries()) {
      const rule = ruleMap.get(pricingGroupId);
      if (!rule) {
        throw new Error(`Missing pricing rule for group ${pricingGroupId}`);
      }

      const metricTotal = roundCurrency(groupRows.reduce((sum, row) => sum + row.quantity, 0));
      const groupSlug = groupRows[0].product.pricing_group_slug ?? pricingGroupId;

      if (!options.ignoreRuleConstraints) {
        validateConstraints(rule, metricTotal, groupSlug);
      }

      const groupSubtotal = roundCurrency(
        groupRows.reduce((sum, row) => sum + row.product.base_price * row.quantity, 0)
      );

      const tier = pickTier(rule.tiers, metricTotal);
      const discount = Math.min(groupSubtotal, applyTierDiscount(groupSubtotal, metricTotal, tier));
      const groupTotal = roundCurrency(groupSubtotal - discount);

      subtotal += groupSubtotal;
      volumeDiscount += discount;

      quoteLines.push(...buildQuoteLines(groupRows, discount, groupSubtotal));

      groups.push({
        pricing_group_id: pricingGroupId,
        pricing_group_slug: groupSlug,
        metric_total: metricTotal,
        tier_min: tier.min,
        subtotal: groupSubtotal,
        discount,
        total: groupTotal
      });
    }

    subtotal = roundCurrency(subtotal);
    volumeDiscount = roundCurrency(volumeDiscount);

    let promoDiscount = 0;
    if (input.promoCode) {
      const promo = await promoRepository.getByCode(input.promoCode);
      if (!promo) throw new Error("Invalid promo code.");
      assertPromoWindow(promo.starts_at, promo.ends_at);
      if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
        throw new Error("Promo code usage limit reached.");
      }

      const afterVolume = roundCurrency(subtotal - volumeDiscount);
      if (afterVolume < promo.min_subtotal) {
        throw new Error(`Promo code requires at least $${promo.min_subtotal.toFixed(2)} subtotal.`);
      }

      promoDiscount =
        promo.discount_type === "percent"
          ? roundCurrency(afterVolume * (promo.discount_value / 100))
          : roundCurrency(promo.discount_value);

      if (promo.max_discount !== null) {
        promoDiscount = Math.min(promoDiscount, promo.max_discount);
      }

      promoDiscount = Math.min(promoDiscount, afterVolume);
    }

    const savings = roundCurrency(volumeDiscount + promoDiscount);
    const total = roundCurrency(subtotal - savings);

    return {
      subtotal,
      volumeDiscount,
      promoDiscount,
      savings,
      total,
      items: quoteLines,
      groups
    };
  }
}

export const pricingEngine = new PricingEngine();
