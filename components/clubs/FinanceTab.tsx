/**
 * FinanceTab - Main Finance container for clubs and organizers
 *
 * Shows:
 * - Overview cards (Gross Sales, Refunds, Platform Fee, Net Revenue)
 * - Payout info banner
 * - Transaction table with filters
 * - Export functionality
 *
 * Supports both club and organizer modes:
 * - Pass clubId for club finance view
 * - Pass organizerId for organizer finance view
 *
 * @version 07.53
 * @file components/clubs/FinanceTab.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FinanceOverview } from './FinanceOverview';
import { FinanceTransactions } from './FinanceTransactions';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import {
  getClubFinanceOverviewLast30Days,
  getClubTransactions,
  getOrganizerFinanceOverviewLast30Days,
  getOrganizerTransactions,
} from '../../services/firebase/payments/finance';
import {
  FinanceTransaction,
  FinanceOverview as FinanceOverviewType,
  FinanceReferenceType,
} from '../../services/firebase/payments/types';
import { createConnectLoginLink, createUserConnectLoginLink } from '../../services/stripe';

// ============================================
// CSV & Export Helper Functions
// ============================================

/**
 * Properly escape a value for CSV output
 * - Handles commas, quotes, newlines
 * - Protects against Excel formula injection (=, +, -, @)
 */
const csvCell = (v: any): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);

  // Excel formula injection protection - prefix with single quote
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  // Wrap in quotes if contains comma, quote, or newline
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

/**
 * Get Stripe fee - use stored value if available, otherwise calculate
 * Handles payments vs refunds differently
 */
const getStripeFee = (tx: FinanceTransaction): number => {
  // Prefer explicit field if stored
  if ((tx as any).stripeFeeAmount !== undefined) {
    return (tx as any).stripeFeeAmount;
  }

  const inferred = tx.amount - tx.clubNetAmount - tx.platformFeeAmount;

  // For payments: clamp to 0 to prevent negative pennies from rounding
  if (tx.type === 'payment') return Math.max(0, inferred);

  // For refunds: inferred can be 0 or negative - keep as-is
  if (tx.type === 'refund') return inferred;

  // Others (future: payout, adjustment, etc.): don't clamp
  return inferred;
};

/**
 * Sanitize string for fixed-width text report (NOT CSV)
 * Removes newlines and extra whitespace for table alignment
 */
const cleanForReport = (s: any): string =>
  String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

interface FinanceTabProps {
  /** Club ID for club finance view */
  clubId?: string;
  /** Organizer user ID for organizer finance view */
  organizerId?: string;
  /** Stripe connected account ID */
  stripeAccountId?: string;
}

export const FinanceTab: React.FC<FinanceTabProps> = ({ clubId, organizerId, stripeAccountId }) => {
  // Determine which mode we're in
  const isOrganizerMode = !!organizerId && !clubId;
  const entityId = clubId || organizerId || '';

  // State
  const [overview, setOverview] = useState<FinanceOverviewType | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, _setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'payment' | 'refund'>('all');
  const [referenceFilter, setReferenceFilter] = useState<FinanceReferenceType | 'all'>('all');
  const [dateRange, setDateRange] = useState<'30d' | '90d' | 'all'>('30d');

  // Load data
  const loadData = useCallback(async () => {
    if (!entityId) return;

    setLoading(true);
    try {
      // Load overview - use appropriate function based on mode
      const overviewData = isOrganizerMode
        ? await getOrganizerFinanceOverviewLast30Days(entityId)
        : await getClubFinanceOverviewLast30Days(entityId);
      setOverview(overviewData);

      // Calculate date range
      let startDate: number | undefined;
      const now = Date.now();
      if (dateRange === '30d') {
        startDate = now - 30 * 24 * 60 * 60 * 1000;
      } else if (dateRange === '90d') {
        startDate = now - 90 * 24 * 60 * 60 * 1000;
      }

      // Load transactions - use appropriate function based on mode
      const { transactions: txList, hasMore: more } = isOrganizerMode
        ? await getOrganizerTransactions({
            organizerUserId: entityId,
            type: typeFilter === 'all' ? undefined : typeFilter,
            referenceType: referenceFilter === 'all' ? undefined : referenceFilter,
            startDate,
            limit: 20,
          })
        : await getClubTransactions({
            odClubId: entityId,
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
  }, [entityId, isOrganizerMode, typeFilter, referenceFilter, dateRange]);

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
      // Use appropriate login link function based on mode
      const { url } = isOrganizerMode
        ? await createUserConnectLoginLink(stripeAccountId)
        : await createConnectLoginLink(stripeAccountId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to create Stripe login link:', error);
      // Fallback to direct dashboard URL (platform owner access)
      window.open(`https://dashboard.stripe.com/connect/accounts/${stripeAccountId}`, '_blank');
    } finally {
      setLoadingStripeLink(false);
    }
  };

  // Export CSV - Standard format with all fields
  const handleExportCSV = () => {
    if (transactions.length === 0) return;
    setExportMenuOpen(false);

    const headers = [
      'Date', 'Time', 'Description', 'Payer', 'Email', 'Type',
      'Gross', 'Platform Fee', 'Stripe Fee', 'Net', 'Status',
      'Reference Type', 'Reference ID', 'Reference Name',
      'Charge ID', 'Payment Intent ID', 'Balance Txn ID',
      'Session ID', 'Refund ID', 'Stripe Account ID',
      'Payment Method', 'Currency'
    ];

    const rows = transactions.map((tx) => {
      const date = new Date(tx.createdAt);
      const stripeFee = getStripeFee(tx);

      // Build row with raw values, then map ALL through csvCell
      const rawRow = [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        tx.referenceName || tx.referenceType || '',
        tx.payerDisplayName,
        (tx as any).payerEmail || '',
        tx.type,
        (tx.amount / 100).toFixed(2),
        (tx.platformFeeAmount / 100).toFixed(2),
        (stripeFee / 100).toFixed(2),
        (tx.clubNetAmount / 100).toFixed(2),
        tx.status,
        tx.referenceType || '',
        tx.referenceId || '',
        tx.referenceName || '',
        tx.stripe?.chargeId || '',
        tx.stripe?.paymentIntentId || '',
        tx.stripe?.balanceTransactionId || '',
        tx.stripe?.sessionId || '',
        tx.stripe?.refundIds?.[0] || '',
        tx.stripe?.accountId || '',
        tx.stripe?.paymentMethodType || '',
        tx.currency || 'NZD'
      ];

      // Apply csvCell to EVERY field for safety
      return rawRow.map(csvCell);
    });

    // Build CSV
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = isOrganizerMode ? 'organizer-finance' : 'club-finance';
    a.download = `${prefix}-${entityId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export grouped finance report - Human-readable format with subtotals
  const handleExportGroupedReport = () => {
    if (transactions.length === 0) return;
    setExportMenuOpen(false);

    // Group transactions by referenceId + UTC date (for recurring meetups)
    const grouped: Record<string, {
      name: string;
      type: string;
      utcDate: string;
      localDate: string;
      referenceId: string;
      transactions: FinanceTransaction[];
    }> = {};

    transactions.forEach(tx => {
      // Create composite key using UTC date for stable cross-timezone grouping
      const utcDay = new Date(tx.createdAt).toISOString().slice(0, 10);
      const key = `${tx.referenceId || 'uncategorized'}_${utcDay}`;

      if (!grouped[key]) {
        grouped[key] = {
          name: tx.referenceName || tx.referenceId || 'Uncategorized',
          type: tx.referenceType || 'unknown',
          utcDate: utcDay,
          localDate: new Date(tx.createdAt).toLocaleDateString(),
          referenceId: tx.referenceId || '',
          transactions: []
        };
      }
      grouped[key].transactions.push(tx);
    });

    // Build human-readable report
    let report = `Finance Report - Generated ${new Date().toLocaleString()}\n`;
    report += `Entity: ${isOrganizerMode ? 'Organizer' : 'Club'} ${entityId}\n`;
    report += '='.repeat(60) + '\n\n';

    let grandTotalPayments = { count: 0, gross: 0, platformFee: 0, stripeFee: 0, net: 0 };
    let grandTotalRefunds = { count: 0, amount: 0, net: 0 };
    let grandTotalOther = { count: 0, amount: 0 };

    const tableHeaders = 'Date       | Time     | Payer                    | Type    | Gross    | Fees     | Net      | Status';
    const separator = '-'.repeat(tableHeaders.length);

    Object.entries(grouped)
      .sort((a, b) => b[1].transactions[0].createdAt - a[1].transactions[0].createdAt)
      .forEach(([_key, group]) => {
        // Event header
        report += `\n===== ${cleanForReport(group.name)} =====\n`;
        report += `Date: ${group.localDate}\n`;
        report += `Event ID: ${group.referenceId}\n`;
        report += `Type: ${group.type}\n\n`;
        report += tableHeaders + '\n';
        report += separator + '\n';

        // Calculate subtotals - explicit type checking
        let paymentSubtotal = { count: 0, gross: 0, platformFee: 0, stripeFee: 0, net: 0 };
        let refundSubtotal = { count: 0, amount: 0, net: 0 };
        let otherSubtotal = { count: 0, amount: 0 };

        // Transaction rows
        group.transactions
          .sort((a, b) => b.createdAt - a.createdAt)
          .forEach(tx => {
            const date = new Date(tx.createdAt);
            const stripeFee = getStripeFee(tx);
            const totalFees = tx.platformFeeAmount + Math.abs(stripeFee);

            // Format row with fixed-width columns - use cleanForReport NOT csvCell
            const row = [
              date.toLocaleDateString().padEnd(10),
              date.toLocaleTimeString().substring(0, 8).padEnd(8),
              cleanForReport(tx.payerDisplayName).substring(0, 24).padEnd(24),
              tx.type.padEnd(7),
              `$${(tx.amount / 100).toFixed(2)}`.padStart(8),
              `$${(totalFees / 100).toFixed(2)}`.padStart(8),
              `$${(tx.clubNetAmount / 100).toFixed(2)}`.padStart(8),
              tx.status
            ].join(' | ');
            report += row + '\n';

            // Accumulate totals - EXPLICIT type checking
            if (tx.type === 'payment') {
              paymentSubtotal.count++;
              paymentSubtotal.gross += tx.amount;
              paymentSubtotal.platformFee += tx.platformFeeAmount;
              paymentSubtotal.stripeFee += Math.abs(stripeFee);
              paymentSubtotal.net += tx.clubNetAmount;
            } else if (tx.type === 'refund') {
              refundSubtotal.count++;
              refundSubtotal.amount += Math.abs(tx.amount);
              refundSubtotal.net += tx.clubNetAmount;
            } else {
              otherSubtotal.count++;
              otherSubtotal.amount += tx.amount;
            }
          });

        // Subtotal rows
        report += separator + '\n';
        if (paymentSubtotal.count > 0) {
          report += `PAYMENTS: ${paymentSubtotal.count} | `;
          report += `Gross: $${(paymentSubtotal.gross / 100).toFixed(2)} | `;
          report += `Platform: $${(paymentSubtotal.platformFee / 100).toFixed(2)} | `;
          report += `Stripe: $${(paymentSubtotal.stripeFee / 100).toFixed(2)} | `;
          report += `Net: $${(paymentSubtotal.net / 100).toFixed(2)}\n`;
        }
        if (refundSubtotal.count > 0) {
          report += `REFUNDS:  ${refundSubtotal.count} | `;
          report += `Amount: -$${(refundSubtotal.amount / 100).toFixed(2)} | `;
          report += `Net Impact: $${(refundSubtotal.net / 100).toFixed(2)}\n`;
        }
        if (otherSubtotal.count > 0) {
          report += `OTHER:    ${otherSubtotal.count} | `;
          report += `Amount: $${(otherSubtotal.amount / 100).toFixed(2)}\n`;
        }
        const eventNet = (paymentSubtotal.net + refundSubtotal.net) / 100;
        report += `EVENT NET: $${eventNet.toFixed(2)}\n`;

        // Accumulate grand totals
        grandTotalPayments.count += paymentSubtotal.count;
        grandTotalPayments.gross += paymentSubtotal.gross;
        grandTotalPayments.platformFee += paymentSubtotal.platformFee;
        grandTotalPayments.stripeFee += paymentSubtotal.stripeFee;
        grandTotalPayments.net += paymentSubtotal.net;
        grandTotalRefunds.count += refundSubtotal.count;
        grandTotalRefunds.amount += refundSubtotal.amount;
        grandTotalRefunds.net += refundSubtotal.net;
        grandTotalOther.count += otherSubtotal.count;
        grandTotalOther.amount += otherSubtotal.amount;
      });

    // Grand total section
    report += '\n' + '='.repeat(60) + '\n';
    report += 'GRAND TOTAL\n';
    report += '='.repeat(60) + '\n';
    report += `Payments: ${grandTotalPayments.count} transactions\n`;
    report += `  Gross:        $${(grandTotalPayments.gross / 100).toFixed(2)}\n`;
    report += `  Platform Fee: $${(grandTotalPayments.platformFee / 100).toFixed(2)}\n`;
    report += `  Stripe Fee:   $${(grandTotalPayments.stripeFee / 100).toFixed(2)}\n`;
    report += `  Net:          $${(grandTotalPayments.net / 100).toFixed(2)}\n\n`;
    report += `Refunds: ${grandTotalRefunds.count} transactions\n`;
    report += `  Amount:       -$${(grandTotalRefunds.amount / 100).toFixed(2)}\n`;
    report += `  Net Impact:   $${(grandTotalRefunds.net / 100).toFixed(2)}\n\n`;
    if (grandTotalOther.count > 0) {
      report += `Other: ${grandTotalOther.count} transactions\n`;
      report += `  Amount:       $${(grandTotalOther.amount / 100).toFixed(2)}\n\n`;
    }
    const netRevenue = (grandTotalPayments.net + grandTotalRefunds.net) / 100;
    report += `NET REVENUE: $${netRevenue.toFixed(2)}\n`;

    // Download as .txt (human-readable, not machine-parseable)
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = isOrganizerMode ? 'organizer-finance-report' : 'club-finance-report';
    a.download = `${prefix}-${entityId}-${new Date().toISOString().split('T')[0]}.txt`;
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

        {/* Export Dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
            disabled={transactions.length === 0}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {exportMenuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setExportMenuOpen(false)}
              />

              {/* Dropdown menu */}
              <div className="absolute right-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20">
                <button
                  onClick={handleExportCSV}
                  className="w-full px-4 py-3 text-left text-sm text-white hover:bg-gray-700 rounded-t-lg flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div className="font-medium">Export CSV</div>
                    <div className="text-xs text-gray-400">All fields, machine-readable (.csv)</div>
                  </div>
                </button>
                <button
                  onClick={handleExportGroupedReport}
                  className="w-full px-4 py-3 text-left text-sm text-white hover:bg-gray-700 rounded-b-lg flex items-center gap-3 border-t border-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div className="font-medium">Finance Report</div>
                    <div className="text-xs text-gray-400">Grouped by event with subtotals (.txt)</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
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
