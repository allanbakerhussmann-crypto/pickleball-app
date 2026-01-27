/**
 * TransactionDetailDrawer - Transaction detail view
 *
 * Shows:
 * - Full transaction details
 * - Stripe IDs for support
 * - Refund action
 *
 * @version 07.50
 * @file components/clubs/TransactionDetailDrawer.tsx
 */

import React, { useState } from 'react';
import { httpsCallable } from '@firebase/functions';
import { functions } from '../../services/firebase';
import { FinanceTransaction, formatFinanceCurrency } from '../../services/firebase/payments/types';
import { createConnectLoginLink } from '../../services/stripe';

interface TransactionDetailDrawerProps {
  transaction: FinanceTransaction;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export const TransactionDetailDrawer: React.FC<TransactionDetailDrawerProps> = ({
  transaction,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loadingStripeLink, setLoadingStripeLink] = useState(false);

  const tx = transaction;

  // Format date with time
  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Issue refund
  const handleRefund = async () => {
    if (!confirm('Are you sure you want to issue a full refund for this transaction?')) {
      return;
    }

    setRefunding(true);
    setRefundError(null);

    try {
      const createRefund = httpsCallable<any, { amount: number }>(functions, 'stripe_createRefund');
      const result = await createRefund({
        transactionId: tx.id,
        reason: 'requested_by_customer',
      });

      alert(`Refund of $${(result.data.amount / 100).toFixed(2)} processed successfully`);
      onRefresh?.();
      onClose();
    } catch (err: any) {
      console.error('Refund error:', err);
      setRefundError(err.message || 'Failed to create refund');
    } finally {
      setRefunding(false);
    }
  };

  // View in Stripe Express Dashboard
  const handleViewInStripe = async () => {
    const accountId = tx.stripe?.accountId;
    if (!accountId) return;

    setLoadingStripeLink(true);
    try {
      const { url } = await createConnectLoginLink(accountId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to create Stripe login link:', error);
      // Fallback to direct URL (platform owner access)
      window.open(`https://dashboard.stripe.com/connect/accounts/${accountId}`, '_blank');
    } finally {
      setLoadingStripeLink(false);
    }
  };

  if (!isOpen) return null;

  const isRefund = tx.type === 'refund';
  const canRefund = tx.type === 'payment' && tx.status === 'completed' && tx.stripe?.chargeId;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-gray-900 shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {isRefund ? 'Refund Details' : 'Transaction Details'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <h4 className="text-xl font-medium text-white">
              {isRefund && <span className="text-red-400">REFUND - </span>}
              {tx.referenceName || tx.referenceType}
            </h4>
            <p className="text-sm text-gray-400 mt-1">
              {formatDateTime(tx.createdAt)}
            </p>
          </div>

          {/* Divider */}
          <hr className="border-gray-800" />

          {/* Details */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Payer</span>
              <span className="text-white">{tx.payerDisplayName || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span className="text-white capitalize">{tx.referenceType.replace('_', ' ')}</span>
            </div>
            {tx.referenceId && (
              <div className="flex justify-between">
                <span className="text-gray-400">Reference</span>
                <span className="text-gray-300 text-sm font-mono">{tx.referenceId}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <hr className="border-gray-800" />

          {/* Amounts */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Gross Amount</span>
              <span className={isRefund ? 'text-red-400' : 'text-white'}>
                {isRefund ? '-' : ''}{formatFinanceCurrency(Math.abs(tx.amount), tx.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Platform Fee</span>
              {isRefund && tx.platformFeeRefundEstimated ? (
                <span className="text-gray-500">(estimated)</span>
              ) : (
                <span className="text-yellow-400">
                  -{formatFinanceCurrency(tx.platformFeeAmount || 0, tx.currency)}
                  {tx.amount > 0 && (
                    <span className="text-gray-500 text-xs ml-1">
                      ({((tx.platformFeeAmount / tx.amount) * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-gray-400">Net to Club</span>
              <span className={isRefund ? 'text-red-400' : 'text-lime-400'}>
                {isRefund ? '-' : ''}{formatFinanceCurrency(Math.abs(tx.clubNetAmount), tx.currency)}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          {tx.stripe?.paymentMethodType && (
            <>
              <hr className="border-gray-800" />
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Payment Method</span>
                  <span className="text-white flex items-center gap-2">
                    💳 {tx.stripe.paymentMethodType.charAt(0).toUpperCase() + tx.stripe.paymentMethodType.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mode</span>
                  <span className={tx.stripe.mode === 'live' ? 'text-red-400' : 'text-yellow-400'}>
                    {tx.stripe.mode === 'live' ? '🔴 Live' : '🟡 Test'}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Refund Warning */}
          {isRefund && tx.platformFeeRefundEstimated && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-yellow-400">⚠️</span>
                <p className="text-sm text-yellow-300">
                  Platform fee reversal depends on Stripe settings and payout timing.
                </p>
              </div>
            </div>
          )}

          {/* Stripe IDs */}
          <hr className="border-gray-800" />
          <div>
            <p className="text-sm text-gray-400 mb-3">Stripe IDs (for support):</p>
            <div className="space-y-2 text-sm">
              {tx.stripe?.sessionId && (
                <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                  <span className="text-gray-400">Session:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-xs truncate max-w-[150px]">
                      {tx.stripe.sessionId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(tx.stripe?.sessionId || '', 'session')}
                      className="text-lime-400 hover:text-lime-300"
                    >
                      {copied === 'session' ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              )}
              {tx.stripe?.chargeId && (
                <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                  <span className="text-gray-400">Charge:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-xs truncate max-w-[150px]">
                      {tx.stripe.chargeId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(tx.stripe?.chargeId || '', 'charge')}
                      className="text-lime-400 hover:text-lime-300"
                    >
                      {copied === 'charge' ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              )}
              {tx.stripe?.paymentIntentId && (
                <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                  <span className="text-gray-400">PI:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-xs truncate max-w-[150px]">
                      {tx.stripe.paymentIntentId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(tx.stripe?.paymentIntentId || '', 'pi')}
                      className="text-lime-400 hover:text-lime-300"
                    >
                      {copied === 'pi' ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {refundError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-400">{refundError}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center gap-3">
          {tx.stripe?.accountId && (
            <button
              onClick={handleViewInStripe}
              disabled={loadingStripeLink}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              {loadingStripeLink && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>}
              {loadingStripeLink ? 'Opening...' : 'View in Stripe'}
            </button>
          )}
          {canRefund && (
            <button
              onClick={handleRefund}
              disabled={refunding}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              {refunding && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>}
              Issue Refund
            </button>
          )}
          {isRefund && tx.parentTransactionId && (
            <button
              onClick={() => {
                // TODO: Navigate to parent transaction
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              View Original Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailDrawer;
