/**
 * BalancesPayoutsPanel - Account balances and payout tracking
 *
 * Shows:
 * - Summary of total available/pending across all accounts
 * - Per-account balance breakdown
 * - Recent payouts with status
 * - Link to Stripe Dashboard
 *
 * @version 07.50
 * @file components/admin/BalancesPayoutsPanel.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClubFinanceBreakdown,
  AccountBalance,
  PayoutData,
} from '../../services/firebase/payments/platformFinanceTypes';
import { getAccountBalances, getAccountPayouts } from '../../services/firebase/payments/platformFinance';
import { formatFinanceCurrency } from '../../services/firebase/payments/types';

interface BalancesPayoutsPanelProps {
  clubs: ClubFinanceBreakdown[];
}

export const BalancesPayoutsPanel: React.FC<BalancesPayoutsPanelProps> = ({ clubs }) => {
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [selectedAccountPayouts, setSelectedAccountPayouts] = useState<PayoutData[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load balances
  const loadBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const clubIds = clubs.filter((c) => c.stripeAccountId).map((c) => c.clubId);
      const accountBalances = await getAccountBalances(clubIds);
      setBalances(accountBalances);
    } catch (err: any) {
      console.error('Failed to load balances:', err);
      setError(err.message || 'Failed to load account balances');
    } finally {
      setLoading(false);
    }
  }, [clubs]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Load payouts for selected account
  const handleViewPayouts = async (stripeAccountId: string) => {
    if (selectedAccountId === stripeAccountId) {
      // Toggle off
      setSelectedAccountId(null);
      setSelectedAccountPayouts([]);
      return;
    }

    setSelectedAccountId(stripeAccountId);
    setPayoutsLoading(true);
    try {
      const payouts = await getAccountPayouts(stripeAccountId, 10);
      setSelectedAccountPayouts(payouts);
    } catch (err: any) {
      console.error('Failed to load payouts:', err);
      setSelectedAccountPayouts([]);
    } finally {
      setPayoutsLoading(false);
    }
  };

  // Format amount from balance (handle multiple currencies)
  const formatBalanceAmount = (amounts: { amount: number; currency: string }[]) => {
    if (amounts.length === 0) return '$0.00';
    // Show primary currency (first one)
    const primary = amounts[0];
    return formatFinanceCurrency(primary.amount, primary.currency.toUpperCase() as any);
  };

  // Get total available and pending
  const getTotals = () => {
    let totalAvailable = 0;
    let totalPending = 0;

    balances.forEach((balance) => {
      // Sum all available amounts (converting to cents)
      balance.available.forEach((a) => {
        totalAvailable += a.amount;
      });
      balance.pending.forEach((p) => {
        totalPending += p.amount;
      });
    });

    return { totalAvailable, totalPending };
  };

  // Get payout status badge
  const getPayoutStatusBadge = (status: PayoutData['status']) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5" />
            Paid
          </span>
        );
      case 'in_transit':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-1.5 animate-pulse" />
            In Transit
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full mr-1.5" />
            Pending
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full mr-1.5" />
            Failed
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-1.5" />
            Canceled
          </span>
        );
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-NZ', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Open Stripe Dashboard
  const openStripeDashboard = () => {
    window.open('https://dashboard.stripe.com/', '_blank');
  };

  // Open specific account in Stripe
  const openStripeAccount = (accountId: string) => {
    window.open(`https://dashboard.stripe.com/connect/accounts/${accountId}`, '_blank');
  };

  const { totalAvailable, totalPending } = getTotals();

  if (loading) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-8 h-8 animate-spin text-lime-500 mx-auto mb-3"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <div className="text-gray-400">Loading account balances...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
        <svg
          className="w-10 h-10 text-red-400 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="text-red-400 mb-2">{error}</div>
        <button
          onClick={loadBalances}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Available</div>
          <div className="text-2xl font-semibold text-green-400">
            {formatFinanceCurrency(totalAvailable, 'NZD')}
          </div>
          <div className="text-xs text-gray-500 mt-1">{balances.length} accounts</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Pending</div>
          <div className="text-2xl font-semibold text-yellow-400">
            {formatFinanceCurrency(totalPending, 'NZD')}
          </div>
          <div className="text-xs text-gray-500 mt-1">Processing to available</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-sm text-gray-400 mb-1">Stripe Dashboard</div>
            <div className="text-sm text-gray-300">Manage all Connect accounts</div>
          </div>
          <button
            onClick={openStripeDashboard}
            className="mt-3 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Open Dashboard
          </button>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={loadBalances}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh Balances
        </button>
      </div>

      {/* Account Details Table */}
      {balances.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No connected accounts with balances found.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h4 className="text-white font-medium">Account Balances</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Club</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">
                    Available
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">
                    Pending
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">
                    Last Updated
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => (
                  <React.Fragment key={balance.clubId}>
                    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="text-sm text-white font-medium">{balance.clubName}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {balance.stripeAccountId.substring(0, 20)}...
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-green-400 font-medium">
                          {formatBalanceAmount(balance.available)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-yellow-400">
                          {formatBalanceAmount(balance.pending)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-gray-400">
                        {new Date(balance.lastUpdated).toLocaleTimeString('en-NZ', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewPayouts(balance.stripeAccountId)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              selectedAccountId === balance.stripeAccountId
                                ? 'bg-lime-500 text-black'
                                : 'bg-gray-700 hover:bg-gray-600 text-white'
                            }`}
                          >
                            {selectedAccountId === balance.stripeAccountId ? 'Hide' : 'Payouts'}
                          </button>
                          <button
                            onClick={() => openStripeAccount(balance.stripeAccountId)}
                            className="px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                          >
                            Stripe
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Payouts Row (Expandable) */}
                    {selectedAccountId === balance.stripeAccountId && (
                      <tr className="bg-gray-800/50">
                        <td colSpan={5} className="px-4 py-4">
                          {payoutsLoading ? (
                            <div className="text-center py-4 text-gray-400">
                              <svg
                                className="w-5 h-5 animate-spin mx-auto mb-2"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Loading payouts...
                            </div>
                          ) : selectedAccountPayouts.length === 0 ? (
                            <div className="text-center py-4 text-gray-400">
                              No recent payouts for this account.
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm text-gray-400 mb-3">
                                Recent Payouts for {balance.clubName}
                              </div>
                              <table className="w-full">
                                <thead>
                                  <tr className="text-xs text-gray-500">
                                    <th className="text-left py-2">Date</th>
                                    <th className="text-right py-2">Amount</th>
                                    <th className="text-center py-2">Status</th>
                                    <th className="text-center py-2">Arrival</th>
                                    <th className="text-center py-2">Bank</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedAccountPayouts.map((payout) => (
                                    <tr key={payout.id} className="text-sm">
                                      <td className="py-2 text-gray-300">
                                        {formatDate(payout.createdAt)}
                                      </td>
                                      <td className="py-2 text-right text-white">
                                        {formatFinanceCurrency(
                                          payout.amount,
                                          payout.currency.toUpperCase() as any
                                        )}
                                      </td>
                                      <td className="py-2 text-center">
                                        {getPayoutStatusBadge(payout.status)}
                                      </td>
                                      <td className="py-2 text-center text-gray-400">
                                        {formatDate(payout.arrivalDate)}
                                      </td>
                                      <td className="py-2 text-center text-gray-500 font-mono">
                                        {payout.bankAccountLast4
                                          ? `••${payout.bankAccountLast4}`
                                          : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-sm text-gray-300">
            <strong>Available</strong> balances can be paid out to the club's bank account.{' '}
            <strong>Pending</strong> balances are from recent payments still clearing (typically 2-7
            days). Payouts are managed by Stripe based on each account's payout schedule.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BalancesPayoutsPanel;
