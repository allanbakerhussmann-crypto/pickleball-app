/**
 * WalletCard Component
 * 
 * Displays wallet balance and quick actions.
 * 
 * FILE LOCATION: components/payments/WalletCard.tsx
 */

import React from 'react';
import { useWallet } from '../../hooks/payments';
import type { SupportedCurrency } from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface WalletCardProps {
  userId: string;
  clubId: string;
  clubName?: string;
  currency?: SupportedCurrency;
  onTopUp?: () => void;
  onViewHistory?: () => void;
  compact?: boolean;
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export const WalletCard: React.FC<WalletCardProps> = ({
  userId,
  clubId,
  clubName,
  currency = 'nzd',
  onTopUp,
  onViewHistory,
  compact = false,
  className = '',
}) => {
  const {
    wallet,
    loading,
    error,
    formattedBalance,
    isActive,
  } = useWallet({
    userId,
    clubId,
    autoCreate: true,
    currency,
    realtime: true,
  });

  if (loading) {
    return (
      <div className={`wallet-card wallet-card--loading ${className}`}>
        <div className="wallet-card__skeleton">
          <div className="skeleton-line skeleton-line--short" />
          <div className="skeleton-line skeleton-line--long" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`wallet-card wallet-card--error ${className}`}>
        <p className="wallet-card__error-text">Unable to load wallet</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`wallet-card wallet-card--compact ${className}`}>
        <div className="wallet-card__balance-row">
          <span className="wallet-card__label">Balance</span>
          <span className="wallet-card__amount">{formattedBalance}</span>
        </div>
        {onTopUp && (
          <button 
            className="wallet-card__btn wallet-card__btn--small"
            onClick={onTopUp}
          >
            Top Up
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`wallet-card ${className}`}>
      <div className="wallet-card__header">
        <h3 className="wallet-card__title">
          {clubName ? `${clubName} Wallet` : 'My Wallet'}
        </h3>
        {!isActive && (
          <span className="wallet-card__badge wallet-card__badge--inactive">
            Inactive
          </span>
        )}
      </div>

      <div className="wallet-card__balance">
        <span className="wallet-card__balance-label">Available Balance</span>
        <span className="wallet-card__balance-amount">{formattedBalance}</span>
      </div>

      <div className="wallet-card__actions">
        {onTopUp && (
          <button 
            className="wallet-card__btn wallet-card__btn--primary"
            onClick={onTopUp}
          >
            Top Up Wallet
          </button>
        )}
        {onViewHistory && (
          <button 
            className="wallet-card__btn wallet-card__btn--secondary"
            onClick={onViewHistory}
          >
            View History
          </button>
        )}
      </div>

      {wallet?.lastTopUpAt && (
        <p className="wallet-card__footer">
          Last top-up: {new Date(wallet.lastTopUpAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};

// ============================================
// STYLES (CSS-in-JS or add to your stylesheet)
// ============================================

export const walletCardStyles = `
.wallet-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.wallet-card--compact {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wallet-card--loading,
.wallet-card--error {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wallet-card__skeleton {
  width: 100%;
}

.skeleton-line {
  height: 16px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 8px;
}

.skeleton-line--short { width: 40%; }
.skeleton-line--long { width: 70%; height: 24px; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.wallet-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.wallet-card__title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.wallet-card__badge {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 12px;
}

.wallet-card__badge--inactive {
  background: #fee2e2;
  color: #dc2626;
}

.wallet-card__balance {
  text-align: center;
  padding: 20px 0;
}

.wallet-card__balance-label {
  display: block;
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.wallet-card__balance-amount {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a2e;
}

.wallet-card__balance-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wallet-card__label {
  font-size: 14px;
  color: #666;
}

.wallet-card__amount {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.wallet-card__actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.wallet-card__btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.wallet-card__btn--small {
  flex: none;
  padding: 8px 16px;
}

.wallet-card__btn--primary {
  background: #1a1a2e;
  color: white;
}

.wallet-card__btn--primary:hover {
  background: #2d2d44;
}

.wallet-card__btn--secondary {
  background: #f5f5f5;
  color: #333;
}

.wallet-card__btn--secondary:hover {
  background: #e8e8e8;
}

.wallet-card__footer {
  font-size: 12px;
  color: #999;
  text-align: center;
  margin-top: 16px;
  margin-bottom: 0;
}

.wallet-card__error-text {
  color: #dc2626;
  font-size: 14px;
}
`;

export default WalletCard;