/**
 * PricingDisplay Component
 * 
 * Displays booking price breakdown.
 * 
 * FILE LOCATION: components/payments/PricingDisplay.tsx
 */

import React from 'react';
import { usePricing, type BookingSlot } from '../../hooks/payments';
import type { PricingContext, SupportedCurrency } from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface PricingDisplayProps {
  context: PricingContext;
  currency?: SupportedCurrency;
  showBreakdown?: boolean;
  showPriceType?: boolean;
  compact?: boolean;
  className?: string;
}

export interface MultiSlotPricingDisplayProps {
  slots: BookingSlot[];
  baseContext: Omit<PricingContext, 'date' | 'startTime' | 'endTime'>;
  currency?: SupportedCurrency;
  className?: string;
}

// ============================================
// SINGLE BOOKING PRICE COMPONENT
// ============================================

export const PricingDisplay: React.FC<PricingDisplayProps> = ({
  context,
  currency = 'nzd',
  showBreakdown = true,
  showPriceType = true,
  compact = false,
  className = '',
}) => {
  const {
    calculatePrice,
    formatPriceAmount,
    getPriceLabel,
    checkIsPeakTime,
    getSummary,
  } = usePricing({ currency });

  const result = calculatePrice(context);
  const isPeak = checkIsPeakTime(context.startTime, context.date);

  if (compact) {
    return (
      <div className={`pricing-display pricing-display--compact ${className}`}>
        <span className="pricing-display__total">{formatPriceAmount(result.totalPrice)}</span>
        {showPriceType && (
          <span className={`pricing-display__type pricing-display__type--${isPeak ? 'peak' : 'offpeak'}`}>
            {getPriceLabel(result.priceType)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`pricing-display ${className}`}>
      {showPriceType && (
        <div className="pricing-display__header">
          <span className={`pricing-display__badge pricing-display__badge--${isPeak ? 'peak' : 'offpeak'}`}>
            {getPriceLabel(result.priceType)}
          </span>
        </div>
      )}

      {showBreakdown && result.breakdown.length > 0 && (
        <div className="pricing-display__breakdown">
          {result.breakdown.map((item, index) => (
            <div 
              key={index} 
              className={`pricing-display__row pricing-display__row--${item.type}`}
            >
              <span className="pricing-display__label">{item.label}</span>
              <span className="pricing-display__amount">
                {item.type === 'discount' ? '-' : ''}
                {formatPriceAmount(Math.abs(item.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="pricing-display__total-row">
        <span className="pricing-display__total-label">Total</span>
        <span className="pricing-display__total-amount">{formatPriceAmount(result.totalPrice)}</span>
      </div>

      {result.savings > 0 && (
        <div className="pricing-display__savings">
          You save {formatPriceAmount(result.savings)}!
        </div>
      )}
    </div>
  );
};

// ============================================
// MULTI-SLOT PRICING COMPONENT
// ============================================

export const MultiSlotPricingDisplay: React.FC<MultiSlotPricingDisplayProps> = ({
  slots,
  baseContext,
  currency = 'nzd',
  className = '',
}) => {
  const {
    calculateMultipleSlots,
    calculateTotalPrice,
    formatPriceAmount,
    getPriceLabel,
  } = usePricing({ currency });

  if (slots.length === 0) {
    return null;
  }

  const results = calculateMultipleSlots(slots, baseContext);
  const totalPrice = calculateTotalPrice(results);
  const totalSavings = results.reduce((sum, r) => sum + r.savings, 0);

  return (
    <div className={`multi-pricing-display ${className}`}>
      <div className="multi-pricing-display__slots">
        {slots.map((slot, index) => {
          const result = results[index];
          return (
            <div key={index} className="multi-pricing-display__slot">
              <div className="multi-pricing-display__slot-info">
                <span className="multi-pricing-display__slot-court">{slot.courtName}</span>
                <span className="multi-pricing-display__slot-time">
                  {formatDate(slot.date)} • {slot.startTime} - {slot.endTime}
                </span>
              </div>
              <div className="multi-pricing-display__slot-price">
                <span className="multi-pricing-display__slot-amount">
                  {formatPriceAmount(result.totalPrice)}
                </span>
                <span className={`multi-pricing-display__slot-type multi-pricing-display__slot-type--${result.priceType}`}>
                  {getPriceLabel(result.priceType)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="multi-pricing-display__summary">
        <div className="multi-pricing-display__row">
          <span>{slots.length} booking{slots.length > 1 ? 's' : ''}</span>
          <span>{formatPriceAmount(totalPrice)}</span>
        </div>
        
        {totalSavings > 0 && (
          <div className="multi-pricing-display__savings">
            Total savings: {formatPriceAmount(totalSavings)}
          </div>
        )}
      </div>

      <div className="multi-pricing-display__total">
        <span className="multi-pricing-display__total-label">Total</span>
        <span className="multi-pricing-display__total-amount">{formatPriceAmount(totalPrice)}</span>
      </div>
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// ============================================
// STYLES
// ============================================

export const pricingDisplayStyles = `
.pricing-display {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 16px;
}

.pricing-display--compact {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
}

.pricing-display__header {
  margin-bottom: 12px;
}

.pricing-display__badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
}

.pricing-display__badge--peak {
  background: #fef3c7;
  color: #d97706;
}

.pricing-display__badge--offpeak {
  background: #dcfce7;
  color: #16a34a;
}

.pricing-display__type {
  font-size: 12px;
  font-weight: 500;
}

.pricing-display__type--peak {
  color: #d97706;
}

.pricing-display__type--offpeak {
  color: #16a34a;
}

.pricing-display__breakdown {
  margin-bottom: 12px;
}

.pricing-display__row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}

.pricing-display__row--charge {
  color: #333;
}

.pricing-display__row--discount {
  color: #16a34a;
}

.pricing-display__row--fee {
  color: #666;
}

.pricing-display__label {
  color: inherit;
}

.pricing-display__amount {
  font-weight: 500;
}

.pricing-display__total-row {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.pricing-display__total-label {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.pricing-display__total,
.pricing-display__total-amount {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
}

.pricing-display__savings {
  margin-top: 8px;
  padding: 8px;
  background: #dcfce7;
  border-radius: 4px;
  font-size: 14px;
  color: #16a34a;
  text-align: center;
}

/* Multi-slot styles */
.multi-pricing-display {
  background: white;
  border-radius: 12px;
  overflow: hidden;
}

.multi-pricing-display__slots {
  border-bottom: 1px solid #eee;
}

.multi-pricing-display__slot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.multi-pricing-display__slot:last-child {
  border-bottom: none;
}

.multi-pricing-display__slot-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.multi-pricing-display__slot-court {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.multi-pricing-display__slot-time {
  font-size: 12px;
  color: #666;
}

.multi-pricing-display__slot-price {
  text-align: right;
}

.multi-pricing-display__slot-amount {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.multi-pricing-display__slot-type {
  font-size: 12px;
}

.multi-pricing-display__slot-type--peak {
  color: #d97706;
}

.multi-pricing-display__slot-type--offpeak,
.multi-pricing-display__slot-type--weekend {
  color: #16a34a;
}

.multi-pricing-display__summary {
  padding: 16px;
  background: #f9f9f9;
}

.multi-pricing-display__row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #666;
}

.multi-pricing-display__savings {
  margin-top: 8px;
  font-size: 14px;
  color: #16a34a;
}

.multi-pricing-display__total {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  background: #1a1a2e;
  color: white;
}

.multi-pricing-display__total-label {
  font-size: 16px;
  font-weight: 500;
}

.multi-pricing-display__total-amount {
  font-size: 20px;
  font-weight: 700;
}
`;

export default PricingDisplay;