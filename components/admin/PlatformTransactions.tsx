/**
 * PlatformTransactions - Platform-wide transaction table
 *
 * Shows all transactions across all clubs with:
 * - Club name column
 * - Filtering by club and type
 * - Fee breakdown
 * - Click to view details
 *
 * @version 07.50
 * @file components/admin/PlatformTransactions.tsx
 */

import React, { useState } from 'react';
import { FinanceTransaction, formatFinanceCurrency } from '../../services/firebase/payments/types';
import { ClubFinanceBreakdown } from '../../services/firebase/payments/platformFinanceTypes';
import { TransactionDetailDrawer } from '../clubs/TransactionDetailDrawer';

interface PlatformTransactionsProps {
  transactions: FinanceTransaction[];
  hasMore: boolean;
  clubFilter: string;
  typeFilter: 'all' | 'payment' | 'refund';
  onClubFilterChange: (clubId: string) => void;
  onTypeFilterChange: (type: 'all' | 'payment' | 'refund') => void;
  clubs: ClubFinanceBreakdown[];
  onRefresh: () => void;
}

export const PlatformTransactions: React.FC<PlatformTransactionsProps> = ({
  transactions,
  hasMore,
  clubFilter,
  typeFilter,
  onClubFilterChange,
  onTypeFilterChange,
  clubs,
  onRefresh,
}) => {
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransaction | null>(null);

  // Get club name from ID
  const getClubName = (clubId: string): string => {
    const club = clubs.find(c => c.clubId === clubId);
    return club?.clubName || clubId;
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-NZ', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Format time
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get type badge
  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      payment: 'bg-green-500/20 text-green-400',
      refund: 'bg-red-500/20 text-red-400',
      dispute: 'bg-orange-500/20 text-orange-400',
    };
    return styles[type] || 'bg-gray-500/20 text-gray-400';
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'text-green-400',
      processing: 'text-yellow-400',
      failed: 'text-red-400',
      refunded: 'text-orange-400',
      disputed: 'text-orange-400',
    };
    return styles[status] || 'text-gray-400';
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Club Filter */}
        <select
          value={clubFilter}
          onChange={(e) => onClubFilterChange(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
        >
          <option value="">All Clubs</option>
          {clubs.map((club) => (
            <option key={club.clubId} value={club.clubId}>
              {club.clubName}
            </option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value as any)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
        >
          <option value="all">All Types</option>
          <option value="payment">Payments</option>
          <option value="refund">Refunds</option>
        </select>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className="ml-auto px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Transactions Table */}
      {transactions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No transactions found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Club</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Description</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Type</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Gross</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Platform</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Stripe</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Net</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const platformFee = tx.platformFeeAmount || 0;
                const totalFee = (tx as any).totalFeeAmount || platformFee;
                const stripeFee = totalFee - platformFee;
                const isRefund = tx.type === 'refund';

                return (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTransaction(tx)}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="text-sm text-white">{formatDate(tx.createdAt)}</div>
                      <div className="text-xs text-gray-500">{formatTime(tx.createdAt)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-white">{getClubName(tx.odClubId)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-white">
                        {isRefund && <span className="text-red-400">REFUND - </span>}
                        {tx.referenceName || tx.referenceType}
                      </div>
                      <div className="text-xs text-gray-500">{tx.payerDisplayName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${getTypeBadge(tx.type)}`}>
                        {tx.referenceType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={isRefund ? 'text-red-400' : 'text-white'}>
                        {isRefund ? '-' : ''}{formatFinanceCurrency(Math.abs(tx.amount), tx.currency)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-lime-400">
                        {formatFinanceCurrency(platformFee, tx.currency)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-purple-400">
                        {stripeFee > 0 ? formatFinanceCurrency(stripeFee, tx.currency) : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={isRefund ? 'text-red-400' : 'text-cyan-400'}>
                        {isRefund ? '-' : ''}{formatFinanceCurrency(Math.abs(tx.clubNetAmount), tx.currency)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs ${getStatusBadge(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <div>
          Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          {hasMore && ' (more available)'}
        </div>
        {hasMore && (
          <button
            onClick={onRefresh}
            className="text-lime-400 hover:text-lime-300"
          >
            Load more
          </button>
        )}
      </div>

      {/* Transaction Detail Drawer */}
      {selectedTransaction && (
        <TransactionDetailDrawer
          transaction={selectedTransaction}
          isOpen={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

export default PlatformTransactions;
