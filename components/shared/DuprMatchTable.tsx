/**
 * DuprMatchTable - Filterable match list for DUPR panel
 *
 * Displays matches with status badges, eligibility toggles, and action buttons.
 * Supports filtering by category and sorting by priority.
 *
 * @version V07.10
 * @file components/shared/DuprMatchTable.tsx
 */

import type { Match } from '../../types';
import type { DuprMatchRowData, DuprFilterOption } from '../../types/duprPanel';

interface DuprMatchTableProps {
  matches: DuprMatchRowData[];
  filter: DuprFilterOption;
  onFilterChange: (filter: DuprFilterOption) => void;
  onReview: (match: Match) => void;
  onFinalise: (match: Match) => void;
  onSubmit: (match: Match) => void;
  onToggleEligibility: (match: Match, eligible: boolean) => void;
  onTest?: (match: Match) => void;
  isLoading?: boolean;
}

// Filter tab configuration
const FILTER_TABS: Array<{ id: DuprFilterOption; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs Review' },
  { id: 'ready_for_dupr', label: 'Ready' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'failed', label: 'Failed' },
  { id: 'blocked', label: 'Blocked' },
];

// Score state badge colors
function getScoreStateBadgeClass(category: string): string {
  switch (category) {
    case 'needs_review':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'proposed':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'ready_for_dupr':
      return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
    case 'submitted':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'failed':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'blocked':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    default:
      return 'bg-gray-500/20 text-gray-500 border-gray-500/30';
  }
}

// Match row component
function MatchRow({
  row,
  onReview,
  onFinalise,
  onSubmit,
  onToggleEligibility,
  onTest,
}: {
  row: DuprMatchRowData;
  onReview: (match: Match) => void;
  onFinalise: (match: Match) => void;
  onSubmit: (match: Match) => void;
  onToggleEligibility: (match: Match, eligible: boolean) => void;
  onTest?: (match: Match) => void;
}) {
  const { match, category, canReview, canFinalise, canSubmit, canToggleEligibility } = row;

  // Get team names
  const sideAName = match.sideA?.name || match.teamAId?.slice(0, 8) || 'TBD';
  const sideBName = match.sideB?.name || match.teamBId?.slice(0, 8) || 'TBD';

  // Get match info
  const poolGroup = match.poolGroup || '';
  const roundNumber = match.roundNumber || 0;
  const court = match.court || '';

  // Check if eligible toggle is enabled
  const isEligible = match.dupr?.eligible !== false;
  const toggleDisabled = !canToggleEligibility;

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
      {/* Match Info */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">
            {sideAName} vs {sideBName}
          </span>
          <span className="text-xs text-gray-500">
            {poolGroup && `${poolGroup} • `}
            {roundNumber > 0 && `Round ${roundNumber} • `}
            {court && `Court ${court}`}
          </span>
        </div>
      </td>

      {/* Score State */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${getScoreStateBadgeClass(category)}`}
        >
          {row.scoreStateLabel}
        </span>
        {row.blockReason && (
          <p className="mt-1 text-xs text-orange-400">{row.blockReason}</p>
        )}
      </td>

      {/* Score Summary */}
      <td className="px-4 py-3">
        {row.officialSummary ? (
          <span className="text-sm text-lime-400 font-mono">{row.officialSummary}</span>
        ) : row.proposalSummary ? (
          <span className="text-sm text-yellow-400 font-mono italic">{row.proposalSummary}</span>
        ) : (
          <span className="text-sm text-gray-600">—</span>
        )}
      </td>

      {/* DUPR Eligible Toggle */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleEligibility(match, !isEligible)}
            disabled={toggleDisabled}
            className={`
              relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${isEligible ? 'bg-lime-500' : 'bg-gray-600'}
              ${toggleDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
            `}
            title={row.eligibilityLockReason || (isEligible ? 'Eligible for DUPR' : 'Not eligible')}
          >
            <span
              className={`
                inline-block h-3 w-3 transform rounded-full bg-white transition-transform
                ${isEligible ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
          {match.dupr?.submitted && (
            <svg className="w-4 h-4 text-lime-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </td>

      {/* DUPR Status */}
      <td className="px-4 py-3">
        <span className={`text-xs font-medium ${
          row.duprStatusLabel === 'Submitted' ? 'text-gray-400' :
          row.duprStatusLabel === 'Ready' ? 'text-lime-400' :
          row.duprStatusLabel === 'Failed' ? 'text-red-400' :
          row.duprStatusLabel === 'Queued' ? 'text-yellow-400' :
          'text-gray-500'
        }`}>
          {row.duprStatusLabel}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {canReview && (
            <button
              onClick={() => onReview(match)}
              className="px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
            >
              Review
            </button>
          )}
          {canFinalise && (
            <button
              onClick={() => onFinalise(match)}
              className="px-2 py-1 text-xs font-medium text-lime-400 hover:text-lime-300 hover:bg-lime-500/10 rounded transition-colors"
            >
              Finalise
            </button>
          )}
          {canSubmit && (
            <button
              onClick={() => onSubmit(match)}
              className="px-2 py-1 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors"
            >
              Submit
            </button>
          )}
          {onTest && (
            <button
              onClick={() => onTest(match)}
              className="px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-500/10 rounded transition-colors"
              title={`Test match ID: ${match.id}`}
            >
              Test
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function DuprMatchTable({
  matches,
  filter,
  onFilterChange,
  onReview,
  onFinalise,
  onSubmit,
  onToggleEligibility,
  onTest,
  isLoading,
}: DuprMatchTableProps) {
  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/50 overflow-hidden">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 bg-gray-800/50 border-b border-gray-700/50 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onFilterChange(tab.id)}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap
              ${filter === tab.id
                ? 'bg-lime-500 text-gray-900'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
              <th className="px-4 py-3 font-medium">Match</th>
              <th className="px-4 py-3 font-medium">Score State</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">DUPR Eligible</th>
              <th className="px-4 py-3 font-medium">DUPR Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading matches...
                  </div>
                </td>
              </tr>
            ) : matches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No matches found
                </td>
              </tr>
            ) : (
              matches.map((row) => (
                <MatchRow
                  key={row.match.id}
                  row={row}
                  onReview={onReview}
                  onFinalise={onFinalise}
                  onSubmit={onSubmit}
                  onToggleEligibility={onToggleEligibility}
                  onTest={onTest}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DuprMatchTable;
