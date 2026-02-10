/**
 * PlatformFinanceTab - Main Platform Finance container
 *
 * Admin-only dashboard showing:
 * - Platform-wide financial overview
 * - All transactions across clubs
 * - Per-club and per-organizer breakdown
 * - Reconciliation tools (clubs and organizers)
 * - Account balances and payouts
 *
 * @version 07.61
 * @file components/admin/PlatformFinanceTab.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlatformOverview } from './PlatformOverview';
import { PlatformTransactions } from './PlatformTransactions';
import { ClubBreakdownTable } from './ClubBreakdownTable';
import { ReconciliationPanel } from './ReconciliationPanel';
import { BalancesPayoutsPanel } from './BalancesPayoutsPanel';
import { ExportModal } from './ExportModal';
import {
  getPlatformFinanceOverview,
  getPlatformTransactions,
  getClubFinanceBreakdown,
  getOrganizerFinanceBreakdown,
} from '../../services/firebase/payments/platformFinance';
import {
  PlatformFinanceOverview,
  PlatformFinanceTab as TabType,
  ClubFinanceBreakdown,
  OrganizerFinanceBreakdown,
  getDateRangeFromPreset,
  DateRangePreset,
} from '../../services/firebase/payments/platformFinanceTypes';
import { FinanceTransaction } from '../../services/firebase/payments/types';

export const PlatformFinanceTab: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PlatformFinanceOverview | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [clubBreakdown, setClubBreakdown] = useState<ClubFinanceBreakdown[]>([]);
  const [organizerBreakdown, setOrganizerBreakdown] = useState<OrganizerFinanceBreakdown[]>([]);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Filters
  const [datePreset, setDatePreset] = useState<DateRangePreset>('last_30_days');
  const [dateRange, setDateRange] = useState(() => getDateRangeFromPreset('last_30_days'));
  const [clubFilter, setClubFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'payment' | 'refund'>('all');

  // Load data based on active tab
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const [overviewData, breakdownData] = await Promise.all([
          getPlatformFinanceOverview(dateRange.start, dateRange.end),
          getClubFinanceBreakdown(dateRange.start, dateRange.end),
        ]);
        setOverview(overviewData);
        setClubBreakdown(breakdownData);
      } else if (activeTab === 'transactions') {
        const { transactions: txList, hasMore } = await getPlatformTransactions({
          startDate: dateRange.start,
          endDate: dateRange.end,
          clubId: clubFilter || undefined,
          type: typeFilter === 'all' ? undefined : typeFilter,
          limit: 50,
        });
        setTransactions(txList);
        setHasMoreTransactions(hasMore);
      } else if (activeTab === 'clubs') {
        const breakdownData = await getClubFinanceBreakdown(dateRange.start, dateRange.end);
        setClubBreakdown(breakdownData);
      } else if (activeTab === 'reconciliation') {
        // Load both club and organizer data for reconciliation
        const [breakdownData, organizerData] = await Promise.all([
          getClubFinanceBreakdown(dateRange.start, dateRange.end),
          getOrganizerFinanceBreakdown(dateRange.start, dateRange.end),
        ]);
        setClubBreakdown(breakdownData);
        setOrganizerBreakdown(organizerData);
      }
    } catch (error) {
      console.error('Error loading platform finance data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateRange, clubFilter, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle date preset change
  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    setDateRange(getDateRangeFromPreset(preset));
  };

  // Tabs configuration
  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'clubs', label: 'By Club' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'payouts', label: 'Balances & Payouts' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-white">Platform Finance</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <select
            value={datePreset}
            onChange={(e) => handleDatePresetChange(e.target.value as DateRangePreset)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="last_quarter">Last Quarter</option>
            <option value="this_year">This Year</option>
          </select>

          {/* Export Button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>

          {/* Open Stripe Dashboard */}
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Stripe Dashboard
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-lime-500 text-lime-500'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-500" />
          </div>
        )}

        {!loading && activeTab === 'overview' && overview && (
          <div className="space-y-6">
            <PlatformOverview overview={overview} />
            {clubBreakdown.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Top Clubs by Volume</h3>
                <ClubBreakdownTable clubs={clubBreakdown.slice(0, 5)} compact />
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'transactions' && (
          <PlatformTransactions
            transactions={transactions}
            hasMore={hasMoreTransactions}
            clubFilter={clubFilter}
            typeFilter={typeFilter}
            onClubFilterChange={setClubFilter}
            onTypeFilterChange={setTypeFilter}
            clubs={clubBreakdown}
            onRefresh={loadData}
          />
        )}

        {!loading && activeTab === 'clubs' && (
          <ClubBreakdownTable clubs={clubBreakdown} />
        )}

        {!loading && activeTab === 'reconciliation' && (
          <ReconciliationPanel
            clubs={clubBreakdown}
            organizers={organizerBreakdown}
            startDate={dateRange.start}
            endDate={dateRange.end}
          />
        )}

        {!loading && activeTab === 'payouts' && (
          <BalancesPayoutsPanel clubs={clubBreakdown} />
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          dateRange={dateRange}
          clubs={clubBreakdown}
        />
      )}
    </div>
  );
};

export default PlatformFinanceTab;
