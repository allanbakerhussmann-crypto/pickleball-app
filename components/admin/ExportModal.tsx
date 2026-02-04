/**
 * ExportModal - CSV/JSON export with filters
 *
 * Allows admins to export transactions with:
 * - Date range selection (presets and custom)
 * - Transaction type filters
 * - Club filters
 * - Format selection (CSV/JSON)
 * - Field set selection (basic/detailed/full)
 *
 * @version 07.50
 * @file components/admin/ExportModal.tsx
 */

import React, { useState } from 'react';
import {
  ClubFinanceBreakdown,
  DateRangePreset,
  getDateRangeFromPreset,
  ExportFormat,
  ExportFieldSet,
} from '../../services/firebase/payments/platformFinanceTypes';
import { FinanceTransactionType } from '../../services/firebase/payments/types';
import { exportTransactions } from '../../services/firebase/payments/platformFinance';
import { ModalShell } from '../shared/ModalShell';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: ClubFinanceBreakdown[];
  defaultStartDate: number;
  defaultEndDate: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  clubs,
  defaultStartDate,
  defaultEndDate,
}) => {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('last_30_days');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [types, setTypes] = useState<FinanceTransactionType[]>(['payment', 'refund']);
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
  const [allClubs, setAllClubs] = useState(true);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [fieldSet, setFieldSet] = useState<ExportFieldSet>('basic');
  const [includeFeeBreakdown, setIncludeFeeBreakdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle date preset change
  const handlePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const range = getDateRangeFromPreset(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  // Handle type toggle
  const handleTypeToggle = (type: FinanceTransactionType) => {
    if (types.includes(type)) {
      setTypes(types.filter((t) => t !== type));
    } else {
      setTypes([...types, type]);
    }
  };

  // Handle club toggle
  const handleClubToggle = (clubId: string) => {
    if (selectedClubIds.includes(clubId)) {
      setSelectedClubIds(selectedClubIds.filter((id) => id !== clubId));
    } else {
      setSelectedClubIds([...selectedClubIds, clubId]);
    }
  };

  // Format date for input
  const formatDateForInput = (timestamp: number) => {
    return new Date(timestamp).toISOString().split('T')[0];
  };

  // Parse date from input
  const parseDateFromInput = (dateStr: string, isEnd: boolean = false) => {
    const date = new Date(dateStr);
    if (isEnd) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return date.getTime();
  };

  // Handle export
  const handleExport = async () => {
    if (types.length === 0) {
      setError('Please select at least one transaction type');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await exportTransactions({
        startDate,
        endDate,
        format,
        fieldSet,
        types,
        clubIds: allClubs ? undefined : selectedClubIds,
        includeFeeBreakdown,
      });

      // Create download
      const blob = new Blob([result.data], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err: any) {
      console.error('Export error:', err);
      setError(err.message || 'Failed to export transactions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Export Transactions</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={datePreset}
                onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}
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
                <option value="ytd">Year to Date</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formatDateForInput(startDate)}
                    onChange={(e) => setStartDate(parseDateFromInput(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formatDateForInput(endDate)}
                    onChange={(e) => setEndDate(parseDateFromInput(e.target.value, true))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Transaction Types */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Transaction Types
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleTypeToggle('payment')}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  types.includes('payment')
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}
              >
                Payments
              </button>
              <button
                onClick={() => handleTypeToggle('refund')}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  types.includes('refund')
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}
              >
                Refunds
              </button>
            </div>
          </div>

          {/* Club Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Clubs</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allClubs}
                  onChange={(e) => setAllClubs(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                />
                <span className="text-sm text-white">All Clubs</span>
              </label>
              {!allClubs && (
                <div className="max-h-32 overflow-y-auto border border-gray-700 rounded-lg p-2 space-y-1">
                  {clubs.map((club) => (
                    <label key={club.clubId} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedClubIds.includes(club.clubId)}
                        onChange={() => handleClubToggle(club.clubId)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                      />
                      <span className="text-sm text-gray-300">{club.clubName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="w-4 h-4 border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                />
                <span className="text-sm text-white">CSV (Spreadsheet)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  checked={format === 'json'}
                  onChange={() => setFormat('json')}
                  className="w-4 h-4 border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                />
                <span className="text-sm text-white">JSON (Developer)</span>
              </label>
            </div>
          </div>

          {/* Field Set Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Include Fields</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="fieldSet"
                  checked={fieldSet === 'basic'}
                  onChange={() => setFieldSet('basic')}
                  className="w-4 h-4 border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                />
                <div>
                  <span className="text-sm text-white">Basic</span>
                  <span className="text-xs text-gray-500 ml-2">Date, Description, Type, Amount, Net</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="fieldSet"
                  checked={fieldSet === 'detailed'}
                  onChange={() => setFieldSet('detailed')}
                  className="w-4 h-4 border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                />
                <div>
                  <span className="text-sm text-white">Detailed</span>
                  <span className="text-xs text-gray-500 ml-2">+ Stripe IDs, Payer, Reference</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="fieldSet"
                  checked={fieldSet === 'full'}
                  onChange={() => setFieldSet('full')}
                  className="w-4 h-4 border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
                />
                <div>
                  <span className="text-sm text-white">Full</span>
                  <span className="text-xs text-gray-500 ml-2">All available fields</span>
                </div>
              </label>
            </div>
          </div>

          {/* Fee Breakdown Option */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFeeBreakdown}
                onChange={(e) => setIncludeFeeBreakdown(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-lime-500 focus:ring-lime-500"
              />
              <div>
                <span className="text-sm text-white">Include Fee Breakdown</span>
                <span className="text-xs text-gray-500 ml-2">Platform Fee, Stripe Fee columns</span>
              </div>
            </label>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="text-sm text-red-400">{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading || types.length === 0}
            className="px-4 py-2 bg-lime-500 hover:bg-lime-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export default ExportModal;
