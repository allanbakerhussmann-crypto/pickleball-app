/**
 * PaymentForm Component
 * 
 * Checkout form for processing payments.
 * Supports card payments and wallet payments.
 * 
 * FILE LOCATION: components/payments/PaymentForm.tsx
 */

import React, { useState, useEffect } from 'react';
import { usePayment, useWallet } from '../../hooks/payments';
import type { 
  SupportedCurrency, 
  ReferenceType,
  TransactionBreakdown,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface PaymentFormProps {
  userId: string;
  clubId?: string;
  amount: number;
  currency?: SupportedCurrency;
  referenceType: ReferenceType;
  referenceId: string;
  referenceName: string;
  breakdown: TransactionBreakdown;
  tournamentId?: string;
  leagueId?: string;
  allowWalletPayment?: boolean;
  onSuccess?: (paymentId: string) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

type PaymentMethod = 'card' | 'wallet';

// ============================================
// COMPONENT
// ============================================

export const PaymentForm: React.FC<PaymentFormProps> = ({
  userId,
  clubId,
  amount,
  currency = 'nzd',
  referenceType,
  referenceId,
  referenceName,
  breakdown,
  tournamentId,
  leagueId,
  allowWalletPayment = true,
  onSuccess,
  onCancel,
  onError,
  className = '',
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Hooks
  const {
    initiatePayment,
    formatAmount,
    validateAmount,
    processing: paymentProcessing,
  } = usePayment({
    userId,
    currency,
    onSuccess: (payment) => onSuccess?.(payment.id),
    onError,
  });

  const {
    wallet,
    balance: walletBalance,
    formattedBalance: formattedWalletBalance,
    checkFunds,
    deduct: deductFromWallet,
  } = useWallet({
    userId,
    clubId: clubId || '',
    autoCreate: false,
    currency,
  });

  // Check if wallet has sufficient funds
  const [hasSufficientFunds, setHasSufficientFunds] = useState(false);
  
  useEffect(() => {
    if (wallet && allowWalletPayment) {
      checkFunds(amount).then(setHasSufficientFunds);
    }
  }, [wallet, amount, allowWalletPayment, checkFunds]);

  // Validate amount
  const amountValidation = validateAmount(amount);
  const formattedAmount = formatAmount(amount);

  // Handle payment submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amountValidation.valid) {
      setPaymentError(amountValidation.error || 'Invalid amount');
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      if (paymentMethod === 'wallet') {
        // Wallet payment
        if (!wallet) {
          throw new Error('No wallet available');
        }
        
        await deductFromWallet(
          amount,
          referenceType,
          referenceId,
          referenceName
        );
        
        onSuccess?.(referenceId);
      } else {
        // Card payment - create pending payment
        const payment = await initiatePayment({
          amount,
          currency,
          referenceType,
          referenceId,
          referenceName,
          breakdown,
          clubId,
          tournamentId,
          leagueId,
        });

        // Note: In a real implementation, you would now:
        // 1. Call your backend to create a Stripe PaymentIntent
        // 2. Use Stripe.js to confirm the payment
        // 3. Handle the result
        
        // For now, we just return the pending payment
        onSuccess?.(payment.id);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Payment failed');
      setPaymentError(error.message);
      onError?.(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`payment-form ${className}`}>
      <div className="payment-form__header">
        <h3 className="payment-form__title">Complete Payment</h3>
        <p className="payment-form__subtitle">{referenceName}</p>
      </div>

      {/* Order Summary */}
      <div className="payment-form__summary">
        <h4 className="payment-form__section-title">Order Summary</h4>
        
        <div className="payment-form__items">
          {breakdown.items.map((item, index) => (
            <div key={index} className="payment-form__item">
              <span className="payment-form__item-label">{item.label}</span>
              <span className={`payment-form__item-amount ${item.type === 'discount' ? 'payment-form__item-amount--discount' : ''}`}>
                {item.type === 'discount' ? '-' : ''}{formatAmount(Math.abs(item.amount))}
              </span>
            </div>
          ))}
        </div>

        <div className="payment-form__total">
          <span className="payment-form__total-label">Total</span>
          <span className="payment-form__total-amount">{formattedAmount}</span>
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="payment-form__methods">
        <h4 className="payment-form__section-title">Payment Method</h4>
        
        <div className="payment-form__method-options">
          <label className={`payment-form__method ${paymentMethod === 'card' ? 'payment-form__method--selected' : ''}`}>
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === 'card'}
              onChange={() => setPaymentMethod('card')}
            />
            <span className="payment-form__method-icon">💳</span>
            <span className="payment-form__method-label">Card</span>
          </label>

          {allowWalletPayment && wallet && (
            <label className={`payment-form__method ${paymentMethod === 'wallet' ? 'payment-form__method--selected' : ''} ${!hasSufficientFunds ? 'payment-form__method--disabled' : ''}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="wallet"
                checked={paymentMethod === 'wallet'}
                onChange={() => setPaymentMethod('wallet')}
                disabled={!hasSufficientFunds}
              />
              <span className="payment-form__method-icon">👛</span>
              <div className="payment-form__method-details">
                <span className="payment-form__method-label">Wallet</span>
                <span className="payment-form__method-balance">
                  Balance: {formattedWalletBalance}
                </span>
              </div>
              {!hasSufficientFunds && (
                <span className="payment-form__method-warning">Insufficient funds</span>
              )}
            </label>
          )}
        </div>
      </div>

      {/* Card Form (placeholder - would integrate with Stripe Elements) */}
      {paymentMethod === 'card' && (
        <div className="payment-form__card-section">
          <h4 className="payment-form__section-title">Card Details</h4>
          <div className="payment-form__card-placeholder">
            <p>Stripe Elements would be integrated here</p>
            <div className="payment-form__card-mock">
              <div className="payment-form__card-row">
                <input
                  type="text"
                  placeholder="Card number"
                  className="payment-form__input"
                  disabled
                />
              </div>
              <div className="payment-form__card-row payment-form__card-row--split">
                <input
                  type="text"
                  placeholder="MM / YY"
                  className="payment-form__input"
                  disabled
                />
                <input
                  type="text"
                  placeholder="CVC"
                  className="payment-form__input"
                  disabled
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {paymentError && (
        <div className="payment-form__error">
          <span className="payment-form__error-icon">⚠️</span>
          <span className="payment-form__error-text">{paymentError}</span>
        </div>
      )}

      {/* Actions */}
      <div className="payment-form__actions">
        {onCancel && (
          <button
            type="button"
            className="payment-form__btn payment-form__btn--secondary"
            onClick={onCancel}
            disabled={isProcessing || paymentProcessing}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="payment-form__btn payment-form__btn--primary"
          onClick={handleSubmit}
          disabled={isProcessing || paymentProcessing || !amountValidation.valid}
        >
          {isProcessing || paymentProcessing ? (
            <span className="payment-form__btn-loading">Processing...</span>
          ) : (
            `Pay ${formattedAmount}`
          )}
        </button>
      </div>

      {/* Security Note */}
      <p className="payment-form__security">
        🔒 Payments are processed securely via Stripe
      </p>
    </div>
  );
};

// ============================================
// STYLES
// ============================================

export const paymentFormStyles = `
.payment-form {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
}

.payment-form__header {
  margin-bottom: 24px;
}

.payment-form__title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin: 0 0 4px 0;
}

.payment-form__subtitle {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.payment-form__section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin: 0 0 12px 0;
}

.payment-form__summary {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.payment-form__items {
  margin-bottom: 12px;
}

.payment-form__item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
}

.payment-form__item-label {
  color: #666;
}

.payment-form__item-amount {
  color: #333;
  font-weight: 500;
}

.payment-form__item-amount--discount {
  color: #16a34a;
}

.payment-form__total {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.payment-form__total-label {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.payment-form__total-amount {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
}

.payment-form__methods {
  margin-bottom: 24px;
}

.payment-form__method-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.payment-form__method {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.payment-form__method input {
  display: none;
}

.payment-form__method--selected {
  border-color: #1a1a2e;
  background: #f9f9f9;
}

.payment-form__method--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.payment-form__method-icon {
  font-size: 24px;
}

.payment-form__method-details {
  display: flex;
  flex-direction: column;
}

.payment-form__method-label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.payment-form__method-balance {
  font-size: 12px;
  color: #666;
}

.payment-form__method-warning {
  margin-left: auto;
  font-size: 12px;
  color: #dc2626;
}

.payment-form__card-section {
  margin-bottom: 24px;
}

.payment-form__card-placeholder {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 16px;
}

.payment-form__card-placeholder p {
  font-size: 12px;
  color: #999;
  margin: 0 0 12px 0;
  text-align: center;
}

.payment-form__card-mock {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.payment-form__card-row {
  display: flex;
  gap: 12px;
}

.payment-form__card-row--split .payment-form__input {
  flex: 1;
}

.payment-form__input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.payment-form__input:disabled {
  background: #f5f5f5;
  color: #999;
}

.payment-form__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fee2e2;
  border-radius: 8px;
  margin-bottom: 16px;
}

.payment-form__error-icon {
  font-size: 16px;
}

.payment-form__error-text {
  font-size: 14px;
  color: #dc2626;
}

.payment-form__actions {
  display: flex;
  gap: 12px;
}

.payment-form__btn {
  flex: 1;
  padding: 14px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.payment-form__btn--primary {
  background: #1a1a2e;
  color: white;
}

.payment-form__btn--primary:hover:not(:disabled) {
  background: #2d2d44;
}

.payment-form__btn--primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.payment-form__btn--secondary {
  background: #f5f5f5;
  color: #333;
}

.payment-form__btn--secondary:hover:not(:disabled) {
  background: #e8e8e8;
}

.payment-form__btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.payment-form__security {
  font-size: 12px;
  color: #999;
  text-align: center;
  margin: 16px 0 0 0;
}
`;

export default PaymentForm;