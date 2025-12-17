/**
 * PriceBreakdown Component
 * 
 * Displays itemized pricing with discounts and totals.
 * 
 * FILE LOCATION: components/checkout/PriceBreakdown.tsx
 */

import React from 'react';
import type { PriceCalculation, PriceLineItem } from '../../services/firebase/pricing';

// ============================================
// TYPES
// ============================================

export interface PriceBreakdownProps {
  pricing: PriceCalculation;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (cents: number): string => {
  const prefix = cents < 0 ? '-' : '';
  return `${prefix}NZ$${(Math.abs(cents) / 100).toFixed(2)}`;
};

// ============================================
// COMPONENT
// ============================================

export const PriceBreakdown: React.FC<PriceBreakdownProps> = ({
  pricing,
  showLabel = true,
  compact = false,
  className = '',
}) => {
  if (compact) {
    return (
      <div className={`price-breakdown price-breakdown--compact ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Total</span>
          <div className="text-right">
            {pricing.isFree ? (
              <span className="text-green-400 font-bold text-lg">Free</span>
            ) : (
              <>
                <span className="text-white font-bold text-lg">
                  {formatCurrency(pricing.finalPrice)}
                </span>
                {pricing.savings > 0 && (
                  <span className="text-green-400 text-sm ml-2">
                    (Save {formatCurrency(pricing.savings)})
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`price-breakdown bg-gray-900 rounded-lg p-4 ${className}`}>
      {/* Price Label Badge */}
      {showLabel && pricing.priceLabel && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">Pricing</span>
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            pricing.priceLabel.includes('Peak') 
              ? 'bg-orange-900/50 text-orange-400'
              : pricing.priceLabel.includes('Member')
                ? 'bg-blue-900/50 text-blue-400'
                : pricing.priceLabel.includes('Free') || pricing.priceLabel.includes('Annual')
                  ? 'bg-green-900/50 text-green-400'
                  : pricing.priceLabel.includes('Visitor')
                    ? 'bg-purple-900/50 text-purple-400'
                    : 'bg-gray-700 text-gray-300'
          }`}>
            {pricing.priceLabel}
          </span>
        </div>
      )}

      {/* Line Items */}
      <div className="space-y-2">
        {pricing.lineItems.map((item, index) => (
          <LineItemRow key={index} item={item} />
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700 my-3" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">Total</span>
        {pricing.isFree ? (
          <span className="text-green-400 font-bold text-xl">Free</span>
        ) : (
          <span className="text-white font-bold text-xl">
            {formatCurrency(pricing.finalPrice)}
          </span>
        )}
      </div>

      {/* Savings */}
      {pricing.savings > 0 && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-400 text-sm font-medium">
            You save {formatCurrency(pricing.savings)}!
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================
// LINE ITEM ROW
// ============================================

interface LineItemRowProps {
  item: PriceLineItem;
}

const LineItemRow: React.FC<LineItemRowProps> = ({ item }) => {
  const isDiscount = item.type === 'discount' || item.amount < 0;
  const isFee = item.type === 'fee';

  return (
    <div className="flex items-center justify-between text-sm">
      <span className={`${
        isDiscount ? 'text-green-400' : isFee ? 'text-yellow-400' : 'text-gray-300'
      }`}>
        {item.label}
      </span>
      <span className={`font-medium ${
        isDiscount ? 'text-green-400' : isFee ? 'text-yellow-400' : 'text-white'
      }`}>
        {isDiscount && item.amount < 0 ? '' : item.amount < 0 ? '-' : ''}
        {formatCurrency(item.amount)}
      </span>
    </div>
  );
};

export default PriceBreakdown;