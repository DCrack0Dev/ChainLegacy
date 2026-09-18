'use client';

import React, { useState, useEffect } from 'react';
import { Check, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { getAllPricingOptions, calculatePricing, type PricingRangeId } from '@/lib/pricing';

interface RangeSelectorProps {
  onSelect?: (rangeId: PricingRangeId, pricing: ReturnType<typeof calculatePricing>) => void;
  selectedRangeId?: PricingRangeId;
  className?: string;
  showPricing?: boolean;
}

export function RangeSelector({
  onSelect,
  selectedRangeId,
  className = '',
  showPricing = true,
}: RangeSelectorProps) {
  const [pricingOptions, setPricingOptions] = useState<ReturnType<typeof getAllPricingOptions>>([]);
  const [localSelectedId, setLocalSelectedId] = useState<PricingRangeId | null>(selectedRangeId || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPricingOptions(getAllPricingOptions());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedRangeId) {
      setLocalSelectedId(selectedRangeId);
    }
  }, [selectedRangeId]);

  const handleSelect = (rangeId: PricingRangeId) => {
    const option = pricingOptions.find(o => o.id === rangeId);
    if (!option) return;

    const pricing = calculatePricing(rangeId);
    
    setLocalSelectedId(rangeId);
    onSelect?.(rangeId, pricing!);
  };

  if (loading) {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-32 bg-white/5 rounded-2xl border border-white/10 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {pricingOptions.map((option) => {
        const isSelected = localSelectedId === option.id;
        return (
          <motion.div
            key={option.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="group"
          >
            <button
              type="button"
              onClick={() => handleSelect(option.id)}
              className={cn(
                'relative p-6 rounded-2xl border transition-all duration-300 text-left w-full',
                isSelected
                  ? 'border-gold bg-gold/5 shadow-[0_0_30px_rgba(212,175,55,0.15)]'
                  : 'border-white/10 bg-white/[0.02] hover:border-gold/30 hover:bg-white/[0.03]',
              )}
            >
              {isSelected && (
                <div className="absolute -top-3 -right-3">
                  <Check className="h-6 w-6 text-gold" />
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-12 w-12 rounded-xl flex items-center justify-center',
                    isSelected ? 'bg-gold/20 border border-gold/30' : 'bg-white/5 border border-white/10'
                  )}>
                    <Shield className={cn('h-6 w-6', isSelected ? 'text-gold' : 'text-gray-400')} />
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-4 right-4">
                    <Check className="h-5 w-5 text-gold" />
                  </div>
                )}
              </div>

              <h3 className={cn('text-lg font-black text-white mb-2', isSelected ? 'text-gold' : '')}>
                {option.label}
              </h3>

              {showPricing && (
                <div className="mt-4 space-y-2 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Lifetime (3%)</span>
                    <span className={cn('font-black', isSelected ? 'text-gold' : 'text-white')}>
                      ${option.lifetimeFee.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Monthly (10%)</span>
                    <span className={cn('font-black', isSelected ? 'text-gold' : 'text-white')}>
                      ${option.monthlyFee.toLocaleString()}/mo
                    </span>
                  </div>
                </div>
              )}

              <Button
                type="button"
                className={cn(
                  'w-full mt-4 h-12 uppercase tracking-widest font-black rounded-xl transition-all',
                  isSelected
                    ? 'bg-gold text-black hover:bg-gold-dark'
                    : 'bg-white/5 border border-white/10 text-white hover:border-gold/30 hover:bg-white/[0.03]'
                )}
                onClick={() => handleSelect(option.id)}
                disabled={isSelected}
              >
                {isSelected ? 'Selected' : 'Select Range'}
              </Button>
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}

export function RangeSelectorCard({
  onSelect,
  selectedRangeId,
  title = 'What are you protecting?',
  subtitle = 'Select the approximate value range. You don\'t need to provide an exact amount.',
  className = '',
}: RangeSelectorProps & { title?: string; subtitle?: string }) {
  return (
    <div className={cn('p-8 rounded-3xl bg-white/[0.02] border border-white/5', className)}>
      <div className="text-center mb-8">
        <h3 className="text-2xl md:text-3xl font-black text-white mb-2">{title}</h3>
        <p className="text-gray-500 max-w-2xl mx-auto">{subtitle}</p>
      </div>
      <RangeSelector
        onSelect={onSelect}
        selectedRangeId={selectedRangeId}
        showPricing={true}
      />
    </div>
  );
}