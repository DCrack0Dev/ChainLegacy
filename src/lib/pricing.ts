export const PRICING_RANGES = [
  {
    id: 'value_0_10k',
    label: '$0 – $10,000',
    min: 0,
    max: 10000,
    pricingBasis: 10000,
  },
  {
    id: 'value_10k_25k',
    label: '$10,001 – $25,000',
    min: 10001,
    max: 25000,
    pricingBasis: 25000,
  },
  {
    id: 'value_25k_50k',
    label: '$25,001 – $50,000',
    min: 25001,
    max: 50000,
    pricingBasis: 50000,
  },
  {
    id: 'value_50k_100k',
    label: '$50,001 – $100,000',
    min: 50001,
    max: 100000,
    pricingBasis: 100000,
  },
  {
    id: 'value_100k_250k',
    label: '$100,001 – $250,000',
    min: 100001,
    max: 250000,
    pricingBasis: 250000,
  },
  {
    id: 'value_250k_500k',
    label: '$250,001 – $500,000',
    min: 250001,
    max: 500000,
    pricingBasis: 500000,
  },
  {
    id: 'value_500k_1m',
    label: '$500,001 – $1,000,000',
    min: 500001,
    max: 1000000,
    pricingBasis: 1000000,
  },
] as const;

export type PricingRangeId = (typeof PRICING_RANGES)[number]['id'];
export type PricingRange = (typeof PRICING_RANGES)[number];

export const LIFETIME_FEE_PERCENT = 3;
export const MONTHLY_FEE_PERCENT = 10;

export function calculatePricing(rangeId: PricingRangeId): {
  range: PricingRange;
  pricingBasis: number;
  lifetimeFee: number;
  monthlyFee: number;
} | null {
  const range = PRICING_RANGES.find(r => r.id === rangeId);
  if (!range) return null;

  const pricingBasis = range.pricingBasis;
  const lifetimeFee = Math.round(pricingBasis * LIFETIME_FEE_PERCENT / 100);
  const monthlyFee = Math.round(lifetimeFee * MONTHLY_FEE_PERCENT / 100);

  return {
    range,
    pricingBasis,
    lifetimeFee,
    monthlyFee,
  };
}

export function getAllPricingOptions() {
  return PRICING_RANGES.map(range => {
    const pricing = calculatePricing(range.id);
    return {
      ...range,
      lifetimeFee: pricing!.lifetimeFee,
      monthlyFee: pricing!.monthlyFee,
    };
  });
}