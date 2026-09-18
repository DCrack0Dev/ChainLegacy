import { NextRequest, NextResponse } from 'next/server';
import { calculatePricing, PricingRangeId } from '@/lib/pricing';
import { z } from 'zod';

const CalculatePriceSchema = z.object({
  rangeId: z.string().min(1),
});

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parseResult = CalculatePriceSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid range ID', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { rangeId } = parseResult.data;
    const result = calculatePricing(rangeId as PricingRangeId);

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid range ID' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      rangeId,
      rangeLabel: result.range.label,
      pricingBasis: result.pricingBasis,
      lifetimeFee: result.lifetimeFee,
      monthlyFee: result.monthlyFee,
      currency: 'USD',
      lifetimeFeePercent: 3,
      monthlyFeePercent: 10,
    });
  } catch (error) {
    console.error('Pricing calculation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};

export const GET = async () => {
  try {
    const { getAllPricingOptions } = await import('@/lib/pricing');
    const options = getAllPricingOptions();
    
    return NextResponse.json({
      ranges: options.map(opt => ({
        id: opt.id,
        label: opt.label,
        min: opt.min,
        max: opt.max,
        pricingBasis: opt.pricingBasis,
        lifetimeFee: opt.lifetimeFee,
        monthlyFee: opt.monthlyFee,
        currency: 'USD',
        lifetimeFeePercent: 3,
        monthlyFeePercent: 10,
      })),
      lifetimeFeePercent: 3,
      monthlyFeePercent: 10,
      currency: 'USD',
    });
  } catch (error) {
    console.error('Pricing options fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};