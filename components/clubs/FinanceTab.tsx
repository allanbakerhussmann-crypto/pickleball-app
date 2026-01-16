/**
 * FinanceTab - Main Finance container for clubs
 *
 * Shows:
 * - Overview cards (Gross Sales, Refunds, Platform Fee, Net Revenue)
 * - Payout info banner
 * - Transaction table with filters
 * - Export functionality
 *
 * @version 07.50
 * @file components/clubs/FinanceTab.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FinanceOverview } from './FinanceOverview';
import { FinanceTransactions } from './FinanceTransactions';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import {
  getClubFinanceOverviewLast30Days,
  getClubTransactions,
} from '../../services/firebase/payments/finance';
import {
  FinanceTransaction,
  FinanceOverview as FinanceOverviewType,
  FinanceReferenceType,
} from '../../services/firebase/payments/types';
import { createConnectLoginLink } from '../../services/stripe';

interface FinanceTabProps {
  clubId: string;
  stripeAccountId?: string;
}

export const FinanceTab: React.FC<FinanceTabProps> = ({ clubId, stripeAccountId }) => {
  // State
  const [overview, setOverview] = useState<FinanceOverviewType | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, _setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'payment' | 'refund'>('all');
  const [referenceFilter, setReferenceFilter] = useState<FinanceReferenceType | 'all'>('all');
  const [dateRange, setDateRange] = useState<'30d' | '90d' | 'all'>('30d');

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load overview
      const overviewData = await getClubFinanceOverviewLast30Days(clubId);
      setOverview(overviewData);

      // Calculate date range
      let startDate: number | undefined;
      const now = Date.now();
      if (dateRange === '30d') {
        startDate = now - 30 * 24 * 60 * 60 * 1000;
      } else if (dateRange === '90d') {
        startDate = now - 90 * 24 * 60 * 60 * 1000;
      }

      // Load transactions
      const { transactions: txList, hasMore: more } = await getClubTransactions({
        odClubId: clubId,
        type: typeFilter === 'all' ? undefined : typeFilter,
        referenceType: referenceFilter === 'all' ? undefined : referenceFilter,
        startDate,
        limit: 20,
      });

      setTransactions(txList);
      setHasMore(more);
    } catch (error) {
      console.error('Error loading finance data:', error);
    } finally {
      setLoading(false);
    }
  }, [clubId, typeFilter, referenceFilter, dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle transaction click
  const handleTransactionClick = (tx: FinanceTransaction) => {
    setSelectedTransaction(tx);
    setDrawerOpen(true);
  };

  // Close drawer
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedTransaction(null);
  };

  // State for Stripe dashboard link
  const [loadingStripeLink, setLoadingStripeLink] = useState(false);

  // Open Stripe Express Dashboard via login link
  const handleViewInStripe = async () => {
    if (!stripeAccountId) return;

    setLoadingStripeLink(true);
    try {
      const { url } = await createConnectLoginLink(stripeAccountId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to create Stripe login link:', error);
      // Fallback to direct dashboard URL (platform owner access)
      window.open(`https://dashboard.stripe.com/connect/accounts/${stripeAccountId}`, '_blank');
    } finally {
      setLoadingStripeLink(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (transactions.length === 0) return;

    const headers = ['Date', 'Description', 'Payer', 'Type', 'Gross', 'Fee', 'Net', 'Status'];
    const rows = transactions.map((tx) => [
      new Date(tx.createdAt).toLocaleDateString(),
      tx.referenceName || tx.referenceType,
      tx.payerDisplayName,
      tx.type,
      (tx.amount / 100).toFixed(2),
      (tx.platformFeeAmount / 100).toFixed(2),
      (tx.clubNetAmount / 100).toFixed(2),
      tx.status,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-${clubId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Finance</h2>
        {stripeAccountId && (
          <button
            onClick={handleViewInStripe}
            disabled={loadingStripeLink}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            {loadingStripeLink ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            )}
            {loadingStripeLink ? 'Opening...' : 'View in Stripe'}
          </button>
        )}
      </div>

      {/* Overview Cards */}
      {overview && <FinanceOverview overview={overview} />}

      {/* Payout Info Banner */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-300">
              Payouts are handled automatically by Stripe to your bank account.
              View payout schedule and history in your Stripe Dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
        >
          <option value="all">All Types</option>
          <option value="payment">Payments</option>
          <option value="refund">Refunds</option>
        </select>

        {/* Reference Filter */}
        <select
          value={referenceFilter}
          onChange={(e) => setReferenceFilter(e.target.value as any)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
        >
          <option value="all">All Categories</option>
          <option value="meetup">Meetups</option>
          <option value="court_booking">Court Bookings</option>
          <option value="tournament">Tournaments</option>
          <option value="league">Leagues</option>
        </select>

        {/* Date Range */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as any)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
        >
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          disabled={transactions.length === 0}
          className="ml-auto px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Transactions Table */}
      <FinanceTransactions
        transactions={transactions}
        onTransactionClick={handleTransactionClick}
        loading={loadingMore}
        hasMore={hasMore}
        onLoadMore={() => {
          // TODO: Implement pagination
        }}
      />

      {/* Transaction Detail Drawer */}
      {selectedTransaction && (
        <TransactionDetailDrawer
          transaction={selectedTransaction}
          isOpen={drawerOpen}
          onClose={handleCloseDrawer}
          onRefresh={loadData}
        />
      )}
    </div>
  );
};

export default FinanceTab;
