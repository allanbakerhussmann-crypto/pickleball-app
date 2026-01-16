/**
 * PlatformOverview - Summary cards for Platform Finance
 *
 * Shows:
 * - Gross Volume
 * - Platform Fees (our 1.5%)
 * - Stripe Fees
 * - Refunds
 * - Net Platform Revenue
 * - Active Clubs count
 *
 * @version 07.50
 * @file components/admin/PlatformOverview.tsx
 */

import React from 'react';
import { PlatformFinanceOverview } from '../../services/firebase/payments/platformFinanceTypes';
import { formatFinanceCurrency } from '../../services/firebase/payments/types';

interface PlatformOverviewProps {
  overview: PlatformFinanceOverview;
}

export const PlatformOverview: React.FC<PlatformOverviewProps> = ({ overview }) => {
  const {
    grossVolume,
    platformFeesCollected,
    stripeFeesCollected,
    refundsTotal,
    netPlatformRevenue,
    transactionCount,
    refundCount,
    disputeCount,
    activeClubCount,
    currency,
  } = overview;

  const cards = [
    {
      label: 'Gross Volume',
      value: formatFinanceCurrency(grossVolume, currency),
      subtitle: `${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}`,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
    {
      label: 'Platform Fees',
      value: formatFinanceCurrency(platformFeesCollected, currency),
      subtitle: '1.5% of volume',
      color: 'text-lime-400',
      bgColor: 'bg-lime-500/10',
      borderColor: 'border-lime-500/20',
    },
    {
      label: 'Stripe Fees',
      value: formatFinanceCurrency(stripeFeesCollected, currency),
      subtitle: '~2.7% + 70¢',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
    },
    {
      label: 'Refunds',
      value: refundsTotal > 0 ? `-${formatFinanceCurrency(refundsTotal, currency)}` : formatFinanceCurrency(0, currency),
      subtitle: refundCount > 0 ? `${refundCount} refund${refundCount !== 1 ? 's' : ''}` : 'No refunds',
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
    },
    {
      label: 'Disputes',
      value: disputeCount.toString(),
      subtitle: disputeCount > 0 ? 'Needs attention' : 'None',
      color: disputeCount > 0 ? 'text-orange-400' : 'text-gray-400',
      bgColor: disputeCount > 0 ? 'bg-orange-500/10' : 'bg-gray-500/10',
      borderColor: disputeCount > 0 ? 'border-orange-500/20' : 'border-gray-500/20',
    },
    {
      label: 'Active Clubs',
      value: activeClubCount.toString(),
      subtitle: 'With transactions',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/20',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Main cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`${card.bgColor} ${card.borderColor} border rounded-lg p-4`}
          >
            <div className="text-sm text-gray-400 mb-1">{card.label}</div>
            <div className={`text-xl font-semibold ${card.color}`}>{card.value}</div>
            <div className="text-xs text-gray-500 mt-1">{card.subtitle}</div>
          </div>
        ))}
      </div>

      {/* Net Platform Revenue Banner */}
      <div className="bg-lime-500/10 border border-lime-500/20 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-400">Net Platform Revenue</div>
            <div className="text-2xl font-bold text-lime-400">
              {formatFinanceCurrency(netPlatformRevenue, currency)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Platform fees collected (1.5% of gross volume after refund reversals)
            </div>
          </div>
          <div className="hidden md:block text-right">
            <div className="text-sm text-gray-400">Fee Rate</div>
            <div className="text-lg font-medium text-lime-400">1.5%</div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-sm text-gray-300">
            <strong>Platform Revenue</strong> = 1.5% application fees from all club transactions.
            <strong className="ml-2">Stripe Fees</strong> (~2.7% + 70¢) are taken from club payouts, not platform revenue.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformOverview;
