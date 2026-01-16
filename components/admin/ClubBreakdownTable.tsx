/**
 * ClubBreakdownTable - Per-club volume and fees breakdown
 *
 * Shows:
 * - Club name with Stripe status indicator
 * - Gross volume
 * - Platform fees (our 1.5%)
 * - Stripe fees
 * - Net to club
 * - Transaction counts
 * - Actions (view in Stripe)
 *
 * @version 07.50
 * @file components/admin/ClubBreakdownTable.tsx
 */

import React from 'react';
import { ClubFinanceBreakdown } from '../../services/firebase/payments/platformFinanceTypes';
import { formatFinanceCurrency } from '../../services/firebase/payments/types';

interface ClubBreakdownTableProps {
  clubs: ClubFinanceBreakdown[];
  compact?: boolean;
}

export const ClubBreakdownTable: React.FC<ClubBreakdownTableProps> = ({
  clubs,
  compact = false,
}) => {
  // Get status badge
  const getStatusBadge = (status: 'ready' | 'pending' | 'none') => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5" />
            Ready
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full mr-1.5" />
            Pending
          </span>
        );
      case 'none':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-1.5" />
            None
          </span>
        );
    }
  };

  // Open Stripe Connect account details
  const openStripeAccount = (accountId: string) => {
    window.open(`https://dashboard.stripe.com/connect/accounts/${accountId}`, '_blank');
  };

  if (clubs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No clubs with transactions found.
      </div>
    );
  }

  // Calculate totals
  const totals = clubs.reduce(
    (acc, club) => ({
      grossVolume: acc.grossVolume + club.grossVolume,
      platformFees: acc.platformFees + club.platformFees,
      stripeFees: acc.stripeFees + club.stripeFees,
      netToClub: acc.netToClub + club.netToClub,
      transactionCount: acc.transactionCount + club.transactionCount,
      refundCount: acc.refundCount + club.refundCount,
    }),
    {
      grossVolume: 0,
      platformFees: 0,
      stripeFees: 0,
      netToClub: 0,
      transactionCount: 0,
      refundCount: 0,
    }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Club</th>
            {!compact && (
              <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Status</th>
            )}
            <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Gross</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Platform</th>
            {!compact && (
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Stripe</th>
            )}
            <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Net</th>
            {!compact && (
              <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Txns</th>
            )}
            {!compact && (
              <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <tr
              key={club.clubId}
              className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
            >
              <td className="py-3 px-4">
                <div className="text-sm text-white font-medium">{club.clubName}</div>
                {!compact && club.stripeAccountId && (
                  <div className="text-xs text-gray-500 font-mono">
                    {club.stripeAccountId.substring(0, 20)}...
                  </div>
                )}
              </td>
              {!compact && (
                <td className="py-3 px-4 text-center">
                  {getStatusBadge(club.stripeStatus)}
                </td>
              )}
              <td className="py-3 px-4 text-right">
                <span className="text-white">
                  {formatFinanceCurrency(club.grossVolume, 'NZD')}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-lime-400">
                  {formatFinanceCurrency(club.platformFees, 'NZD')}
                </span>
              </td>
              {!compact && (
                <td className="py-3 px-4 text-right">
                  <span className="text-purple-400">
                    {formatFinanceCurrency(club.stripeFees, 'NZD')}
                  </span>
                </td>
              )}
              <td className="py-3 px-4 text-right">
                <span className="text-cyan-400">
                  {formatFinanceCurrency(club.netToClub, 'NZD')}
                </span>
              </td>
              {!compact && (
                <td className="py-3 px-4 text-center">
                  <div className="text-sm text-white">{club.transactionCount}</div>
                  {club.refundCount > 0 && (
                    <div className="text-xs text-red-400">
                      {club.refundCount} refund{club.refundCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </td>
              )}
              {!compact && (
                <td className="py-3 px-4 text-center">
                  {club.stripeAccountId && (
                    <button
                      onClick={() => openStripeAccount(club.stripeAccountId!)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      View
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {!compact && (
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50">
              <td className="py-3 px-4 text-sm font-medium text-white">
                Total ({clubs.length} club{clubs.length !== 1 ? 's' : ''})
              </td>
              <td className="py-3 px-4" />
              <td className="py-3 px-4 text-right">
                <span className="text-white font-medium">
                  {formatFinanceCurrency(totals.grossVolume, 'NZD')}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-lime-400 font-medium">
                  {formatFinanceCurrency(totals.platformFees, 'NZD')}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-purple-400 font-medium">
                  {formatFinanceCurrency(totals.stripeFees, 'NZD')}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-cyan-400 font-medium">
                  {formatFinanceCurrency(totals.netToClub, 'NZD')}
                </span>
              </td>
              <td className="py-3 px-4 text-center">
                <span className="text-white font-medium">{totals.transactionCount}</span>
              </td>
              <td className="py-3 px-4" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

export default ClubBreakdownTable;
