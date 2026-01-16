/**
 * FinanceOverview - Summary cards for Finance tab
 *
 * Shows:
 * - Gross Sales
 * - Refunds
 * - Platform Fee
 * - Net Revenue
 *
 * @version 07.50
 * @file components/clubs/FinanceOverview.tsx
 */

import React from 'react';
import { FinanceOverview as FinanceOverviewType, formatFinanceCurrency } from '../../services/firebase/payments/types';

interface FinanceOverviewProps {
  overview: FinanceOverviewType;
}

export const FinanceOverview: React.FC<FinanceOverviewProps> = ({ overview }) => {
  const { grossSales, refundsTotal, platformFeesTotal, netRevenue, currency, transactionCount, refundCount } = overview;

  const cards = [
    {
      label: 'Gross Sales',
      value: formatFinanceCurrency(grossSales, currency),
      subtitle: `${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}`,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
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
      label: 'Total Fees',
      value: `-${formatFinanceCurrency(platformFeesTotal, currency)}`,
      subtitle: 'Platform + Stripe',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
    },
    {
      label: 'Net Revenue',
      value: formatFinanceCurrency(netRevenue, currency),
      subtitle: 'After fees & refunds',
      color: 'text-lime-400',
      bgColor: 'bg-lime-500/10',
      borderColor: 'border-lime-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
  );
};

export default FinanceOverview;
