/**
 * FinanceTransactions - Transaction table for Finance tab
 *
 * Shows:
 * - Date, Description, Payer, Type, Gross, Fee, Net
 * - Click to view details
 * - Load more pagination
 *
 * @version 07.50
 * @file components/clubs/FinanceTransactions.tsx
 */

import React from 'react';
import { FinanceTransaction, formatFinanceCurrency } from '../../services/firebase/payments/types';

interface FinanceTransactionsProps {
  transactions: FinanceTransaction[];
  onTransactionClick: (tx: FinanceTransaction) => void;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export const FinanceTransactions: React.FC<FinanceTransactionsProps> = ({
  transactions,
  onTransactionClick,
  loading,
  hasMore,
  onLoadMore,
}) => {
  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-NZ', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Get type icon
  const getTypeIcon = (tx: FinanceTransaction) => {
    if (tx.type === 'refund') {
      return (
        <span title="Refund" className="text-red-400">
          ↩️
        </span>
      );
    }

    const paymentType = tx.stripe?.paymentMethodType;
    if (paymentType === 'card') {
      return (
        <span title="Card Payment" className="text-blue-400">
          💳
        </span>
      );
    }

    return (
      <span title="Payment" className="text-green-400">
        💵
      </span>
    );
  };

  // Get reference type badge color
  const getReferenceColor = (refType: string): string => {
    switch (refType) {
      case 'meetup':
        return 'bg-purple-500/20 text-purple-400';
      case 'court_booking':
        return 'bg-blue-500/20 text-blue-400';
      case 'tournament':
        return 'bg-orange-500/20 text-orange-400';
      case 'league':
        return 'bg-green-500/20 text-green-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  // Format reference type for display
  const formatReferenceType = (refType: string): string => {
    const map: Record<string, string> = {
      meetup: 'Meetup',
      court_booking: 'Booking',
      tournament: 'Tournament',
      league: 'League',
      subscription: 'Subscription',
      sms_bundle: 'SMS',
    };
    return map[refType] || refType;
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-8 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
        </svg>
        <p className="text-gray-400">No transactions found</p>
        <p className="text-sm text-gray-500 mt-1">Transactions will appear here once payments are processed</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Gross</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Fee</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                onClick={() => onTransactionClick(tx)}
                className="hover:bg-gray-700/30 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm text-white">{formatDate(tx.createdAt)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <div className="text-sm text-white">
                      {tx.type === 'refund' && <span className="text-red-400 mr-1">REFUND -</span>}
                      {tx.referenceName || tx.referenceType}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      {getTypeIcon(tx)} {tx.payerDisplayName || 'Unknown'}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getReferenceColor(tx.referenceType)}`}>
                    {formatReferenceType(tx.referenceType)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className={tx.type === 'refund' ? 'text-red-400' : 'text-white'}>
                    {tx.type === 'refund' ? '-' : ''}
                    {formatFinanceCurrency(Math.abs(tx.amount), tx.currency)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  {tx.type === 'refund' && tx.platformFeeRefundEstimated ? (
                    <span className="text-gray-500 text-xs">(est.)</span>
                  ) : (
                    <span className="text-yellow-400">
                      -{formatFinanceCurrency((tx as any).totalFeeAmount || tx.platformFeeAmount || 0, tx.currency)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className={tx.type === 'refund' ? 'text-red-400' : 'text-lime-400'}>
                    {tx.type === 'refund' ? '-' : ''}
                    {formatFinanceCurrency(Math.abs(tx.clubNetAmount), tx.currency)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="p-4 border-t border-gray-700 text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Loading...
              </span>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-700 text-center text-xs text-gray-500">
        Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
};

export default FinanceTransactions;
