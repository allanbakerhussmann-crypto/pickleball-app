/**
 * PaymentMethodSelector Component
 * 
 * Allows user to select payment method:
 * - Wallet (with balance display)
 * - Card (via Stripe)
 * - Annual Pass (if applicable)
 * 
 * FILE LOCATION: components/checkout/PaymentMethodSelector.tsx
 */

import React from 'react';
import type { PaymentMethod } from '../../services/firebase/checkout';

// ============================================
// TYPES
// ============================================

export interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  
  // Amount to pay
  amount: number;  // In cents
  isFree: boolean;
  
  // Wallet info
  walletBalance: number | null;  // In cents, null if no wallet
  canPayWithWallet: boolean;
  
  // Annual pass info
  hasAnnualPass: boolean;
  annualPassCoversThis: boolean;
  
  // Card payment enabled
  cardEnabled?: boolean;
  
  className?: string;
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (cents: number): string => {
  return `NZ$${(cents / 100).toFixed(2)}`;
};

// ============================================
// COMPONENT
// ============================================

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  selectedMethod,
  onSelect,
  amount,
  isFree,
  walletBalance,
  canPayWithWallet,
  hasAnnualPass,
  annualPassCoversThis,
  cardEnabled = false,  // Disabled until Stripe connected
  className = '',
}) => {
  // If free, no payment needed
  if (isFree) {
    return (
      <div className={`payment-method-selector ${className}`}>
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-green-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-semibold text-lg">No Payment Required</span>
          </div>
          <p className="text-green-300 text-sm mt-1">
            {annualPassCoversThis 
              ? 'Covered by your Annual Pass' 
              : hasAnnualPass 
                ? 'Member benefit - Free booking'
                : 'This booking is free'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`payment-method-selector ${className}`}>
      <h3 className="text-sm font-medium text-gray-300 mb-3">Payment Method</h3>
      
      <div className="space-y-2">
        {/* Wallet Option */}
        <PaymentOption
          selected={selectedMethod === 'wallet'}
          onClick={() => canPayWithWallet && onSelect('wallet')}
          disabled={!canPayWithWallet}
          icon="👛"
          title="Pay with Wallet"
          subtitle={
            walletBalance !== null
              ? `Balance: ${formatCurrency(walletBalance)}`
              : 'No wallet found'
          }
          badge={
            canPayWithWallet 
              ? { text: 'Instant', color: 'green' }
              : walletBalance !== null && walletBalance < amount
                ? { text: 'Insufficient funds', color: 'red' }
                : undefined
          }
          warning={
            !canPayWithWallet && walletBalance !== null && walletBalance < amount
              ? `Need ${formatCurrency(amount - walletBalance)} more`
              : undefined
          }
        />

        {/* Card Option */}
        <PaymentOption
          selected={selectedMethod === 'card'}
          onClick={() => cardEnabled && onSelect('card')}
          disabled={!cardEnabled}
          icon="💳"
          title="Pay with Card"
          subtitle={cardEnabled ? 'Visa, Mastercard, Amex' : 'Coming soon'}
          badge={
            !cardEnabled 
              ? { text: 'Not available', color: 'gray' }
              : undefined
          }
        />

        {/* Annual Pass Option (only if they have one but it doesn't cover this) */}
        {hasAnnualPass && !annualPassCoversThis && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <span>🎫</span>
              <span>Your Annual Pass doesn't cover this booking type</span>
            </div>
          </div>
        )}
      </div>

      {/* Top-up prompt if wallet has insufficient funds */}
      {walletBalance !== null && walletBalance < amount && (
        <div className="mt-4 bg-blue-900/30 border border-blue-700 rounded-lg p-3">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-300 font-medium">Top up your wallet</p>
              <p className="text-blue-400 text-sm mt-1">
                Add {formatCurrency(amount - walletBalance)} or more to pay with wallet.
              </p>
              <button className="mt-2 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded font-medium transition-colors">
                Top Up Wallet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// PAYMENT OPTION CARD
// ============================================

interface PaymentOptionProps {
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: string;
  title: string;
  subtitle: string;
  badge?: { text: string; color: 'green' | 'red' | 'gray' | 'blue' };
  warning?: string;
}

const PaymentOption: React.FC<PaymentOptionProps> = ({
  selected,
  onClick,
  disabled,
  icon,
  title,
  subtitle,
  badge,
  warning,
}) => {
  const badgeColors = {
    green: 'bg-green-900/50 text-green-400',
    red: 'bg-red-900/50 text-red-400',
    gray: 'bg-gray-700 text-gray-400',
    blue: 'bg-blue-900/50 text-blue-400',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
        selected
          ? 'bg-green-900/20 border-green-500 ring-2 ring-green-500/50'
          : disabled
            ? 'bg-gray-800/30 border-gray-700 opacity-60 cursor-not-allowed'
            : 'bg-gray-800 border-gray-700 hover:border-gray-500 cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <span className="text-2xl">{icon}</span>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${selected ? 'text-green-400' : 'text-white'}`}>
              {title}
            </span>
            {badge && (
              <span className={`text-xs px-2 py-0.5 rounded ${badgeColors[badge.color]}`}>
                {badge.text}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 truncate">{subtitle}</p>
          {warning && (
            <p className="text-xs text-red-400 mt-1">{warning}</p>
          )}
        </div>
        
        {/* Selection indicator */}
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          selected
            ? 'border-green-500 bg-green-500'
            : 'border-gray-600'
        }`}>
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
};

export default PaymentMethodSelector;