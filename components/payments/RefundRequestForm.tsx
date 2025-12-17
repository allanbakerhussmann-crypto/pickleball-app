/**
 * RefundRequestForm Component
 * 
 * Form for requesting refunds on payments.
 * 
 * FILE LOCATION: components/payments/RefundRequestForm.tsx
 */

import React, { useState, useEffect } from 'react';
import { useRefund } from '../../hooks/payments';
import type { 
  Payment, 
  RefundReason, 
  RefundPolicy,
  SupportedCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface RefundRequestFormProps {
  payment: Payment;
  userId: string;
  policy?: RefundPolicy;
  onSuccess?: (refundId: string) => void;
  onCancel?: () => void;
  className?: string;
}

const REFUND_REASONS: { value: RefundReason; label: string }[] = [
  { value: 'customer_request', label: 'Change of plans' },
  { value: 'booking_cancelled', label: 'Booking was cancelled' },
  { value: 'event_cancelled', label: 'Event was cancelled' },
  { value: 'service_issue', label: 'Service issue' },
  { value: 'duplicate_payment', label: 'Duplicate payment' },
  { value: 'pricing_error', label: 'Pricing error' },
  { value: 'other', label: 'Other reason' },
];

// ============================================
// COMPONENT
// ============================================

export const RefundRequestForm: React.FC<RefundRequestFormProps> = ({
  payment,
  userId,
  policy,
  onSuccess,
  onCancel,
  className = '',
}) => {
  const [reason, setReason] = useState<RefundReason>('customer_request');
  const [reasonDetails, setReasonDetails] = useState('');
  const [refundAmount, setRefundAmount] = useState<number>(payment.amount - (payment.refundedAmount || 0));
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    requestRefund,
    calculateRefund,
    checkCanRefund,
    formatAmount,
    getReasonLabel,
    getEstimatedTime,
  } = useRefund({
    userId,
    policy,
  });

  // Check if payment can be refunded
  const [canRefund, setCanRefund] = useState<{ canRefund: boolean; reason?: string; maxAmount?: number } | null>(null);
  
  useEffect(() => {
    checkCanRefund(payment.id).then(setCanRefund);
  }, [payment.id, checkCanRefund]);

  // Calculate refund breakdown
  const calculation = calculateRefund(payment, isFullRefund ? undefined : refundAmount);
  const maxRefundable = payment.amount - (payment.refundedAmount || 0);

  // Handle full/partial toggle
  const handleRefundTypeChange = (full: boolean) => {
    setIsFullRefund(full);
    if (full) {
      setRefundAmount(maxRefundable);
    }
  };

  // Handle amount change
  const handleAmountChange = (value: string) => {
    const cents = Math.round(parseFloat(value) * 100) || 0;
    setRefundAmount(Math.min(cents, maxRefundable));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canRefund?.canRefund) {
      setError(canRefund?.reason || 'Cannot process refund');
      return;
    }

    if (reason === 'other' && !reasonDetails.trim()) {
      setError('Please provide details for your refund reason');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const refund = await requestRefund({
        paymentId: payment.id,
        amount: isFullRefund ? undefined : refundAmount,
        reason,
        reasonDetails: reasonDetails.trim() || undefined,
        requestedBy: userId,
      });

      onSuccess?.(refund.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit refund request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cannot refund state
  if (canRefund && !canRefund.canRefund) {
    return (
      <div className={`refund-form refund-form--disabled ${className}`}>
        <div className="refund-form__header">
          <h3 className="refund-form__title">Request Refund</h3>
        </div>
        <div className="refund-form__disabled-message">
          <span className="refund-form__disabled-icon">⚠️</span>
          <p>{canRefund.reason}</p>
        </div>
        {onCancel && (
          <button 
            className="refund-form__btn refund-form__btn--secondary"
            onClick={onCancel}
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <form className={`refund-form ${className}`} onSubmit={handleSubmit}>
      <div className="refund-form__header">
        <h3 className="refund-form__title">Request Refund</h3>
        <p className="refund-form__subtitle">For: {payment.referenceName}</p>
      </div>

      {/* Original Payment Info */}
      <div className="refund-form__payment-info">
        <div className="refund-form__info-row">
          <span>Original Amount</span>
          <span>{formatAmount(payment.amount, payment.currency)}</span>
        </div>
        {(payment.refundedAmount || 0) > 0 && (
          <div className="refund-form__info-row">
            <span>Already Refunded</span>
            <span>-{formatAmount(payment.refundedAmount || 0, payment.currency)}</span>
          </div>
        )}
        <div className="refund-form__info-row refund-form__info-row--highlight">
          <span>Available for Refund</span>
          <span>{formatAmount(maxRefundable, payment.currency)}</span>
        </div>
      </div>

      {/* Refund Amount Selection */}
      <div className="refund-form__section">
        <label className="refund-form__label">Refund Amount</label>
        
        <div className="refund-form__amount-options">
          <label className={`refund-form__option ${isFullRefund ? 'refund-form__option--selected' : ''}`}>
            <input
              type="radio"
              name="refundType"
              checked={isFullRefund}
              onChange={() => handleRefundTypeChange(true)}
            />
            <span>Full Refund</span>
            <span className="refund-form__option-amount">
              {formatAmount(maxRefundable, payment.currency)}
            </span>
          </label>

          {policy?.allowPartialRefunds !== false && (
            <label className={`refund-form__option ${!isFullRefund ? 'refund-form__option--selected' : ''}`}>
              <input
                type="radio"
                name="refundType"
                checked={!isFullRefund}
                onChange={() => handleRefundTypeChange(false)}
              />
              <span>Partial Refund</span>
            </label>
          )}
        </div>

        {!isFullRefund && (
          <div className="refund-form__partial-amount">
            <span className="refund-form__currency-symbol">
              {payment.currency === 'nzd' ? 'NZ$' : payment.currency === 'aud' ? 'A$' : '$'}
            </span>
            <input
              type="number"
              className="refund-form__amount-input"
              value={(refundAmount / 100).toFixed(2)}
              onChange={(e) => handleAmountChange(e.target.value)}
              min="0.01"
              max={(maxRefundable / 100).toFixed(2)}
              step="0.01"
            />
          </div>
        )}
      </div>

      {/* Refund Reason */}
      <div className="refund-form__section">
        <label className="refund-form__label">Reason for Refund</label>
        <select
          className="refund-form__select"
          value={reason}
          onChange={(e) => setReason(e.target.value as RefundReason)}
        >
          {REFUND_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {reason === 'other' && (
          <textarea
            className="refund-form__textarea"
            placeholder="Please describe your reason..."
            value={reasonDetails}
            onChange={(e) => setReasonDetails(e.target.value)}
            rows={3}
          />
        )}
      </div>

      {/* Refund Breakdown */}
      <div className="refund-form__breakdown">
        <h4 className="refund-form__breakdown-title">Refund Summary</h4>
        
        <div className="refund-form__breakdown-row">
          <span>Refund Amount</span>
          <span>{formatAmount(calculation.requestedAmount, payment.currency)}</span>
        </div>
        
        {calculation.cancellationFee > 0 && (
          <div className="refund-form__breakdown-row refund-form__breakdown-row--fee">
            <span>Cancellation Fee</span>
            <span>-{formatAmount(calculation.cancellationFee, payment.currency)}</span>
          </div>
        )}
        
        <div className="refund-form__breakdown-row refund-form__breakdown-row--total">
          <span>You'll Receive</span>
          <span>{formatAmount(calculation.netRefundAmount, payment.currency)}</span>
        </div>
      </div>

      {/* Processing Time */}
      <div className="refund-form__processing-time">
        <span className="refund-form__processing-icon">⏱️</span>
        <span>Estimated processing time: {getEstimatedTime('original')}</span>
      </div>

      {/* Error Display */}
      {error && (
        <div className="refund-form__error">
          <span className="refund-form__error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="refund-form__actions">
        {onCancel && (
          <button
            type="button"
            className="refund-form__btn refund-form__btn--secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="refund-form__btn refund-form__btn--primary"
          disabled={isSubmitting || !canRefund?.canRefund}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Refund Request'}
        </button>
      </div>
    </form>
  );
};

// ============================================
// STYLES
// ============================================

export const refundRequestFormStyles = `
.refund-form {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
}

.refund-form--disabled {
  text-align: center;
}

.refund-form__header {
  margin-bottom: 24px;
}

.refund-form__title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin: 0 0 4px 0;
}

.refund-form__subtitle {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.refund-form__disabled-message {
  padding: 24px;
  background: #fef3c7;
  border-radius: 8px;
  margin-bottom: 20px;
}

.refund-form__disabled-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 12px;
}

.refund-form__disabled-message p {
  color: #92400e;
  margin: 0;
}

.refund-form__payment-info {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.refund-form__info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
  color: #666;
}

.refund-form__info-row--highlight {
  border-top: 1px solid #e0e0e0;
  margin-top: 8px;
  padding-top: 12px;
  font-weight: 600;
  color: #333;
}

.refund-form__section {
  margin-bottom: 20px;
}

.refund-form__label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
}

.refund-form__amount-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.refund-form__option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.refund-form__option input {
  display: none;
}

.refund-form__option--selected {
  border-color: #1a1a2e;
  background: #f9f9f9;
}

.refund-form__option-amount {
  margin-left: auto;
  font-weight: 500;
  color: #333;
}

.refund-form__partial-amount {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.refund-form__currency-symbol {
  font-size: 16px;
  color: #666;
  margin-right: 8px;
}

.refund-form__amount-input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 18px;
  font-weight: 500;
}

.refund-form__select {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.refund-form__textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  resize: vertical;
}

.refund-form__breakdown {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.refund-form__breakdown-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin: 0 0 12px 0;
}

.refund-form__breakdown-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
  color: #666;
}

.refund-form__breakdown-row--fee {
  color: #dc2626;
}

.refund-form__breakdown-row--total {
  border-top: 1px solid #e0e0e0;
  margin-top: 8px;
  padding-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #16a34a;
}

.refund-form__processing-time {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #dbeafe;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
  color: #1e40af;
}

.refund-form__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fee2e2;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #dc2626;
}

.refund-form__actions {
  display: flex;
  gap: 12px;
}

.refund-form__btn {
  flex: 1;
  padding: 14px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.refund-form__btn--primary {
  background: #1a1a2e;
  color: white;
}

.refund-form__btn--primary:hover:not(:disabled) {
  background: #2d2d44;
}

.refund-form__btn--primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.refund-form__btn--secondary {
  background: #f5f5f5;
  color: #333;
}

.refund-form__btn--secondary:hover:not(:disabled) {
  background: #e8e8e8;
}
`;

export default RefundRequestForm;