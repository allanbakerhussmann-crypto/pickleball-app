/**
 * AnnualPassCard Component
 * 
 * Displays annual pass information and actions.
 * 
 * FILE LOCATION: components/payments/AnnualPassCard.tsx
 */

import React from 'react';
import { useAnnualPass } from '../../hooks/payments';
import type { AnnualPassConfig, SupportedCurrency } from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface AnnualPassCardProps {
  userId: string;
  clubId: string;
  clubName?: string;
  passConfig?: AnnualPassConfig;
  onPurchase?: () => void;
  onRenew?: () => void;
  onViewUsage?: () => void;
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export const AnnualPassCard: React.FC<AnnualPassCardProps> = ({
  userId,
  clubId,
  clubName,
  passConfig,
  onPurchase,
  onRenew,
  onViewUsage,
  className = '',
}) => {
  const {
    pass,
    loading,
    error,
    isActive,
    daysRemaining,
    canRenew,
    statusLabel,
    statusColor,
    passValue,
    formatSavingsAmount,
  } = useAnnualPass({
    userId,
    clubId,
    realtime: true,
  });

  if (loading) {
    return (
      <div className={`annual-pass-card annual-pass-card--loading ${className}`}>
        <div className="annual-pass-card__skeleton">
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line skeleton-line--subtitle" />
          <div className="skeleton-circle" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`annual-pass-card annual-pass-card--error ${className}`}>
        <p>Unable to load pass information</p>
      </div>
    );
  }

  // No pass - show purchase option
  if (!pass) {
    return (
      <div className={`annual-pass-card annual-pass-card--no-pass ${className}`}>
        <div className="annual-pass-card__header">
          <h3 className="annual-pass-card__title">Annual Pass</h3>
          {clubName && <p className="annual-pass-card__club">{clubName}</p>}
        </div>

        <div className="annual-pass-card__promo">
          <span className="annual-pass-card__promo-icon">🎫</span>
          <div className="annual-pass-card__promo-text">
            <h4>Unlimited Court Access</h4>
            <p>Book courts all year with a single annual pass</p>
          </div>
        </div>

        {passConfig && (
          <ul className="annual-pass-card__features">
            <li>✓ {passConfig.discountPercent === 100 ? 'Free' : `${passConfig.discountPercent}% off`} court bookings</li>
            {passConfig.maxBookingsPerDay > 0 && (
              <li>✓ Up to {passConfig.maxBookingsPerDay} bookings per day</li>
            )}
            {passConfig.allowPeakHours && <li>✓ Peak hours included</li>}
            <li>✓ Valid for {passConfig.durationDays} days</li>
          </ul>
        )}

        {passConfig && (
          <div className="annual-pass-card__price">
            <span className="annual-pass-card__price-amount">
              {formatPrice(passConfig.price, passConfig.currency)}
            </span>
            <span className="annual-pass-card__price-period">/ year</span>
          </div>
        )}

        {onPurchase && (
          <button 
            className="annual-pass-card__btn annual-pass-card__btn--primary"
            onClick={onPurchase}
          >
            Get Annual Pass
          </button>
        )}
      </div>
    );
  }

  // Has pass - show pass details
  const statusColors: Record<string, string> = {
    green: '#16a34a',
    gray: '#6b7280',
    orange: '#d97706',
    red: '#dc2626',
  };

  return (
    <div className={`annual-pass-card ${className}`}>
      <div className="annual-pass-card__header">
        <div className="annual-pass-card__header-content">
          <h3 className="annual-pass-card__title">Annual Pass</h3>
          {clubName && <p className="annual-pass-card__club">{clubName}</p>}
        </div>
        <span 
          className="annual-pass-card__status"
          style={{ backgroundColor: `${statusColors[statusColor]}20`, color: statusColors[statusColor] }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="annual-pass-card__validity">
        {isActive ? (
          <>
            <div className="annual-pass-card__days-remaining">
              <span className="annual-pass-card__days-number">{daysRemaining}</span>
              <span className="annual-pass-card__days-label">days remaining</span>
            </div>
            <div className="annual-pass-card__dates">
              <span>Valid until {formatDate(pass.endDate)}</span>
            </div>
          </>
        ) : (
          <div className="annual-pass-card__expired">
            <span>Expired on {formatDate(pass.endDate)}</span>
          </div>
        )}
      </div>

      <div className="annual-pass-card__stats">
        <div className="annual-pass-card__stat">
          <span className="annual-pass-card__stat-value">{pass.usageCount}</span>
          <span className="annual-pass-card__stat-label">Bookings Made</span>
        </div>
        <div className="annual-pass-card__stat">
          <span className="annual-pass-card__stat-value">
            {formatSavingsAmount(pass.totalSaved)}
          </span>
          <span className="annual-pass-card__stat-label">Total Saved</span>
        </div>
        {passValue && (
          <div className="annual-pass-card__stat">
            <span className={`annual-pass-card__stat-value annual-pass-card__stat-value--${passValue.valueRating}`}>
              {passValue.roi > 0 ? '+' : ''}{passValue.roi}%
            </span>
            <span className="annual-pass-card__stat-label">ROI</span>
          </div>
        )}
      </div>

      {/* Progress bar showing value */}
      {passValue && (
        <div className="annual-pass-card__progress">
          <div className="annual-pass-card__progress-bar">
            <div 
              className={`annual-pass-card__progress-fill annual-pass-card__progress-fill--${passValue.valueRating}`}
              style={{ width: `${Math.min(100, Math.max(0, passValue.roi + 50))}%` }}
            />
          </div>
          <span className="annual-pass-card__progress-label">
            {passValue.valueRating === 'excellent' && '🎉 Excellent value!'}
            {passValue.valueRating === 'good' && '👍 Good value'}
            {passValue.valueRating === 'fair' && '📊 Breaking even'}
            {passValue.valueRating === 'poor' && '💡 Use more to save!'}
          </span>
        </div>
      )}

      <div className="annual-pass-card__actions">
        {canRenew && onRenew && (
          <button 
            className="annual-pass-card__btn annual-pass-card__btn--primary"
            onClick={onRenew}
          >
            Renew Pass
          </button>
        )}
        {onViewUsage && (
          <button 
            className="annual-pass-card__btn annual-pass-card__btn--secondary"
            onClick={onViewUsage}
          >
            View Usage
          </button>
        )}
      </div>

      {canRenew && daysRemaining <= 14 && (
        <div className="annual-pass-card__renewal-notice">
          ⏰ Your pass expires soon! Renew now to keep your benefits.
        </div>
      )}
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatPrice(amount: number, currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return `${symbols[currency]}${(amount / 100).toFixed(0)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ============================================
// STYLES
// ============================================

export const annualPassCardStyles = `
.annual-pass-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.annual-pass-card--loading,
.annual-pass-card--error {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.annual-pass-card__skeleton {
  width: 100%;
  text-align: center;
}

.skeleton-line--title {
  width: 60%;
  height: 24px;
  margin: 0 auto 8px;
}

.skeleton-line--subtitle {
  width: 40%;
  height: 16px;
  margin: 0 auto 16px;
}

.skeleton-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  margin: 0 auto;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.annual-pass-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.annual-pass-card__title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.annual-pass-card__club {
  font-size: 14px;
  color: #666;
  margin: 4px 0 0 0;
}

.annual-pass-card__status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
}

.annual-pass-card__promo {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%);
  border-radius: 12px;
  margin-bottom: 20px;
}

.annual-pass-card__promo-icon {
  font-size: 40px;
}

.annual-pass-card__promo-text h4 {
  font-size: 16px;
  font-weight: 600;
  color: white;
  margin: 0 0 4px 0;
}

.annual-pass-card__promo-text p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.annual-pass-card__features {
  list-style: none;
  padding: 0;
  margin: 0 0 20px 0;
}

.annual-pass-card__features li {
  font-size: 14px;
  color: #666;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.annual-pass-card__features li:last-child {
  border-bottom: none;
}

.annual-pass-card__price {
  text-align: center;
  margin-bottom: 20px;
}

.annual-pass-card__price-amount {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a2e;
}

.annual-pass-card__price-period {
  font-size: 16px;
  color: #666;
}

.annual-pass-card__validity {
  text-align: center;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 12px;
  margin-bottom: 20px;
}

.annual-pass-card__days-remaining {
  margin-bottom: 8px;
}

.annual-pass-card__days-number {
  font-size: 48px;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1;
}

.annual-pass-card__days-label {
  display: block;
  font-size: 14px;
  color: #666;
  margin-top: 4px;
}

.annual-pass-card__dates,
.annual-pass-card__expired {
  font-size: 14px;
  color: #666;
}

.annual-pass-card__expired {
  color: #dc2626;
}

.annual-pass-card__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.annual-pass-card__stat {
  text-align: center;
}

.annual-pass-card__stat-value {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.annual-pass-card__stat-value--excellent { color: #16a34a; }
.annual-pass-card__stat-value--good { color: #2563eb; }
.annual-pass-card__stat-value--fair { color: #d97706; }
.annual-pass-card__stat-value--poor { color: #dc2626; }

.annual-pass-card__stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.annual-pass-card__progress {
  margin-bottom: 20px;
}

.annual-pass-card__progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.annual-pass-card__progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.annual-pass-card__progress-fill--excellent { background: #16a34a; }
.annual-pass-card__progress-fill--good { background: #2563eb; }
.annual-pass-card__progress-fill--fair { background: #d97706; }
.annual-pass-card__progress-fill--poor { background: #dc2626; }

.annual-pass-card__progress-label {
  font-size: 14px;
  color: #666;
}

.annual-pass-card__actions {
  display: flex;
  gap: 12px;
}

.annual-pass-card__btn {
  flex: 1;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.annual-pass-card__btn--primary {
  background: #1a1a2e;
  color: white;
}

.annual-pass-card__btn--primary:hover {
  background: #2d2d44;
}

.annual-pass-card__btn--secondary {
  background: #f5f5f5;
  color: #333;
}

.annual-pass-card__btn--secondary:hover {
  background: #e8e8e8;
}

.annual-pass-card__renewal-notice {
  margin-top: 16px;
  padding: 12px;
  background: #fef3c7;
  border-radius: 8px;
  font-size: 14px;
  color: #92400e;
  text-align: center;
}
`;

export default AnnualPassCard;