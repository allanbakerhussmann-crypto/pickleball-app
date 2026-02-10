/**
 * ReconciliationPanel - Stripe vs Firestore comparison tool
 *
 * Allows admins to:
 * - Select a club OR organizer to reconcile
 * - Select date range
 * - Run reconciliation to compare Stripe charges vs Firestore transactions
 * - View discrepancies
 * - Add missing transactions
 *
 * @version 07.61
 * @file components/admin/ReconciliationPanel.tsx
 */

import React, { useState } from 'react';
import {
  ClubFinanceBreakdown,
  OrganizerFinanceBreakdown,
  ReconciliationResult,
  OrganizerReconciliationResult,
  ReconciliationDiscrepancy,
  OrganizerReconciliationDiscrepancy,
  getDateRangeFromPreset,
  DateRangePreset,
} from '../../services/firebase/payments/platformFinanceTypes';
import { runReconciliation, addMissingTransaction, runOrganizerReconciliation } from '../../services/firebase/payments/platformFinance';
import { formatFinanceCurrency } from '../../services/firebase/payments/types';

type EntityType = 'club' | 'organizer';
type AnyReconciliationResult = ReconciliationResult | OrganizerReconciliationResult;
type AnyDiscrepancy = ReconciliationDiscrepancy | OrganizerReconciliationDiscrepancy;

// Type guard helpers
const isClubResult = (result: AnyReconciliationResult): result is ReconciliationResult => {
  return 'clubId' in result;
};

const isClubDiscrepancy = (disc: AnyDiscrepancy): disc is ReconciliationDiscrepancy => {
  return 'stripeChargeId' in disc || 'canAutoFix' in disc;
};

// Helper to get matched count from either result type
const getMatchedCount = (result: AnyReconciliationResult): number => {
  if (isClubResult(result)) {
    return result.summary.matchedCount;
  }
  return result.summary.matched;
};

// Helper to get match rate as number
const getMatchRate = (result: AnyReconciliationResult): number => {
  if (isClubResult(result)) {
    return result.summary.matchRate;
  }
  return parseFloat(result.summary.matchRate) || 0;
};

// Helper to get period dates
const getPeriodDates = (result: AnyReconciliationResult): { start: number; end: number } => {
  if (isClubResult(result)) {
    return result.period;
  }
  return { start: result.period.startDate, end: result.period.endDate };
};

interface ReconciliationPanelProps {
  clubs: ClubFinanceBreakdown[];
  organizers?: OrganizerFinanceBreakdown[];
  startDate: number;
  endDate: number;
}

export const ReconciliationPanel: React.FC<ReconciliationPanelProps> = ({
  clubs,
  organizers = [],
  startDate: defaultStartDate,
  endDate: defaultEndDate,
}) => {
  // Entity type toggle (club vs organizer)
  const [entityType, setEntityType] = useState<EntityType>('club');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('last_30_days');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | OrganizerReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);

  // Get selected entity
  const selectedClub = clubs.find((c) => c.clubId === selectedClubId);
  const selectedOrganizer = organizers.find((o) => o.organizerId === selectedOrganizerId);

  // Check if we have valid selection for current entity type
  const hasValidSelection = entityType === 'club'
    ? selectedClub?.stripeAccountId
    : selectedOrganizer?.stripeConnectedAccountId;

  // Handle date preset change
  const handlePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    const range = getDateRangeFromPreset(preset);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  // Handle entity type change - clear selection and results
  const handleEntityTypeChange = (type: EntityType) => {
    setEntityType(type);
    setResult(null);
    setError(null);
    // Clear selection for the new type to force re-selection
    if (type === 'club') {
      setSelectedOrganizerId('');
    } else {
      setSelectedClubId('');
    }
  };

  // Run reconciliation
  const handleRunReconciliation = async () => {
    if (entityType === 'club') {
      if (!selectedClub?.stripeAccountId) {
        setError('Please select a club with a connected Stripe account');
        return;
      }
    } else {
      if (!selectedOrganizer?.stripeConnectedAccountId) {
        setError('Please select an organizer with a connected Stripe account');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (entityType === 'club') {
        const reconciliationResult = await runReconciliation({
          stripeAccountId: selectedClub!.stripeAccountId!,
          clubId: selectedClub!.clubId,
          startDate,
          endDate,
        });
        setResult(reconciliationResult);
      } else {
        const reconciliationResult = await runOrganizerReconciliation({
          organizerId: selectedOrganizer!.organizerId,
          startDate,
          endDate,
        });
        setResult(reconciliationResult);
      }
    } catch (err: any) {
      console.error('Reconciliation error:', err);
      setError(err.message || 'Failed to run reconciliation');
    } finally {
      setLoading(false);
    }
  };

  // Fix a discrepancy by adding missing transaction (club only for now)
  const handleFixDiscrepancy = async (discrepancy: ReconciliationDiscrepancy) => {
    // Auto-fix only supported for clubs currently
    if (entityType !== 'club') {
      setError('Auto-fix is only available for club reconciliation');
      return;
    }
    if (!discrepancy.stripeChargeId || !selectedClub?.stripeAccountId) return;

    setFixingId(discrepancy.stripeChargeId);
    try {
      await addMissingTransaction({
        stripeChargeId: discrepancy.stripeChargeId,
        stripeAccountId: selectedClub.stripeAccountId,
        clubId: selectedClub.clubId,
      });
      // Re-run reconciliation to update the view
      await handleRunReconciliation();
    } catch (err: any) {
      console.error('Fix discrepancy error:', err);
      setError(err.message || 'Failed to add missing transaction');
    } finally {
      setFixingId(null);
    }
  };

  // Get match rate color
  const getMatchRateColor = (rate: number) => {
    if (rate >= 99) return 'text-green-400';
    if (rate >= 95) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Get discrepancy type badge
  const getDiscrepancyBadge = (type: ReconciliationDiscrepancy['type']) => {
    switch (type) {
      case 'missing_in_firestore':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
            Missing in Firestore
          </span>
        );
      case 'missing_in_stripe':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">
            Missing in Stripe
          </span>
        );
      case 'amount_mismatch':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
            Amount Mismatch
          </span>
        );
      case 'club_mismatch':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">
            Wrong Club
          </span>
        );
      case 'status_mismatch':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
            Status Mismatch
          </span>
        );
    }
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-NZ', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4">Run Reconciliation</h3>

        {/* Entity Type Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleEntityTypeChange('club')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              entityType === 'club'
                ? 'bg-lime-500 text-black'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Clubs
          </button>
          <button
            onClick={() => handleEntityTypeChange('organizer')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              entityType === 'organizer'
                ? 'bg-lime-500 text-black'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Organizers
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Entity Selection - Conditional based on entityType */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Select {entityType === 'club' ? 'Club' : 'Organizer'}
            </label>
            {entityType === 'club' ? (
              <select
                value={selectedClubId}
                onChange={(e) => setSelectedClubId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
              >
                <option value="">Choose a club...</option>
                {clubs
                  .filter((c) => c.stripeAccountId)
                  .map((club) => (
                    <option key={club.clubId} value={club.clubId}>
                      {club.clubName}
                    </option>
                  ))}
              </select>
            ) : (
              <select
                value={selectedOrganizerId}
                onChange={(e) => setSelectedOrganizerId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
              >
                <option value="">Choose an organizer...</option>
                {organizers
                  .filter((o) => o.stripeConnectedAccountId)
                  .map((org) => (
                    <option key={org.organizerId} value={org.organizerId}>
                      {org.organizerName} ({org.organizerEmail})
                    </option>
                  ))}
              </select>
            )}
            {entityType === 'organizer' && organizers.filter(o => o.stripeConnectedAccountId).length === 0 && (
              <p className="text-sm text-gray-500 mt-1">No organizers with Stripe accounts found</p>
            )}
          </div>

          {/* Date Range Preset */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Date Range</label>
            <select
              value={datePreset}
              onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
            >
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="last_quarter">Last Quarter</option>
            </select>
          </div>

          {/* Run Button */}
          <div className="flex items-end">
            <button
              onClick={handleRunReconciliation}
              disabled={!hasValidSelection || loading}
              className="w-full px-4 py-2 bg-lime-500 hover:bg-lime-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
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
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                  Run Reconciliation
                </>
              )}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="text-sm text-gray-400">
          Compares Stripe balance transactions against Firestore transactions to identify discrepancies.
          {entityType === 'organizer' && (
            <span className="block mt-1 text-yellow-400/80">
              Note: Organizer reconciliation is limited to 90 days max.
            </span>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Firestore Total</div>
              <div className="text-xl font-semibold text-white">
                {formatFinanceCurrency(result.summary.firestoreTotal, 'NZD')}
              </div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Stripe Total</div>
              <div className="text-xl font-semibold text-white">
                {formatFinanceCurrency(result.summary.stripeTotal, 'NZD')}
              </div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Difference</div>
              <div
                className={`text-xl font-semibold ${
                  result.summary.difference === 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {result.summary.difference === 0
                  ? '$0.00'
                  : formatFinanceCurrency(result.summary.difference, 'NZD')}
              </div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Match Rate</div>
              <div className={`text-xl font-semibold ${getMatchRateColor(getMatchRate(result))}`}>
                {getMatchRate(result).toFixed(1)}%
                {getMatchRate(result) >= 99 && (
                  <span className="ml-2 text-green-400">✓</span>
                )}
              </div>
            </div>
          </div>

          {/* Detailed Summary */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Matched:</span>
                <span className="ml-2 text-green-400">{getMatchedCount(result)}</span>
              </div>
              {isClubResult(result) ? (
                <>
                  <div>
                    <span className="text-gray-400">Missing in Firestore:</span>
                    <span
                      className={`ml-2 ${
                        result.summary.missingInFirestore > 0 ? 'text-red-400' : 'text-gray-500'
                      }`}
                    >
                      {result.summary.missingInFirestore}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Missing in Stripe:</span>
                    <span
                      className={`ml-2 ${
                        result.summary.missingInStripe > 0 ? 'text-orange-400' : 'text-gray-500'
                      }`}
                    >
                      {result.summary.missingInStripe}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Amount Mismatches:</span>
                    <span
                      className={`ml-2 ${
                        result.summary.amountMismatches > 0 ? 'text-yellow-400' : 'text-gray-500'
                      }`}
                    >
                      {result.summary.amountMismatches}
                    </span>
                  </div>
                  {result.summary.clubMismatches > 0 && (
                    <div>
                      <span className="text-gray-400">Wrong Club:</span>
                      <span className="ml-2 text-cyan-400">
                        {result.summary.clubMismatches}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <span className="text-gray-400">Discrepancies:</span>
                    <span
                      className={`ml-2 ${
                        result.summary.discrepancyCount > 0 ? 'text-red-400' : 'text-gray-500'
                      }`}
                    >
                      {result.summary.discrepancyCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Ignored (Payouts/Fees):</span>
                    <span className="ml-2 text-gray-500">
                      {result.summary.ignoredCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Ignored Types:</span>
                    <span className="ml-2 text-gray-500">
                      {Object.keys(result.summary.ignoredTypes).join(', ') || 'None'}
                    </span>
                  </div>
                </>
              )}
              <div>
                <span className="text-gray-400">Period:</span>
                <span className="ml-2 text-white">
                  {formatDate(getPeriodDates(result).start)} - {formatDate(getPeriodDates(result).end)}
                </span>
              </div>
            </div>
          </div>

          {/* Discrepancies Table */}
          {result.discrepancies.length > 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h4 className="text-white font-medium">
                  Discrepancies ({result.discrepancies.length})
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        Description
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">
                        Stripe
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">
                        Firestore
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">
                        Diff
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.discrepancies.map((disc, index) => {
                      // Get values that differ between club and organizer discrepancies
                      const stripeId = isClubDiscrepancy(disc) ? disc.stripeChargeId : (disc as OrganizerReconciliationDiscrepancy).stripeId;
                      const diffAmount = isClubDiscrepancy(disc) ? disc.difference : (disc as OrganizerReconciliationDiscrepancy).diff;
                      const canFix = isClubDiscrepancy(disc) && disc.canAutoFix;
                      const createdAt = isClubDiscrepancy(disc) ? disc.createdAt : undefined;

                      return (
                        <tr key={index} className="border-b border-gray-800/50">
                          <td className="py-3 px-4">{getDiscrepancyBadge(disc.type)}</td>
                          <td className="py-3 px-4 text-sm text-gray-400">
                            {createdAt ? formatDate(createdAt) : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm text-white">{disc.description || '-'}</div>
                            {stripeId && (
                              <div className="text-xs text-gray-500 font-mono">
                                {stripeId}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-white">
                            {disc.stripeAmount !== undefined
                              ? formatFinanceCurrency(disc.stripeAmount, 'NZD')
                              : '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-white">
                            {disc.firestoreAmount !== undefined
                              ? formatFinanceCurrency(disc.firestoreAmount, 'NZD')
                              : '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-red-400">
                            {diffAmount !== undefined
                              ? formatFinanceCurrency(diffAmount, 'NZD')
                              : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {canFix && entityType === 'club' && isClubDiscrepancy(disc) && (
                              <button
                                onClick={() => handleFixDiscrepancy(disc)}
                                disabled={fixingId === disc.stripeChargeId}
                                className="px-3 py-1 text-xs bg-lime-500 hover:bg-lime-600 disabled:bg-gray-600 text-black rounded transition-colors"
                              >
                                {fixingId === disc.stripeChargeId ? 'Fixing...' : 'Fix'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center">
              <svg
                className="w-12 h-12 text-green-400 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-lg font-medium text-green-400">All Reconciled</div>
              <div className="text-sm text-gray-400 mt-1">
                No discrepancies found between Stripe and Firestore for this period.
              </div>
            </div>
          )}

          {/* Run Info */}
          <div className="text-sm text-gray-500 text-center">
            Reconciliation run at{' '}
            {new Date(result.runAt).toLocaleString('en-NZ', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && !error && (
        <div className="text-center py-12 text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <div>
            Select a {entityType === 'club' ? 'club' : 'organizer'} and run reconciliation to compare Stripe and Firestore data.
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconciliationPanel;
