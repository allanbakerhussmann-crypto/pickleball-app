/**
 * OrganizerMatchPanel - Match Management Panel for Non-DUPR Leagues
 *
 * Provides organizer controls for match finalization without DUPR submission.
 * Design mirrors DuprControlPanel but without DUPR-specific features.
 *
 * V07.50: Added playerNameLookup prop to resolve substitute names that may
 *         be stored as "Unknown" in older matches.
 *
 * @version V07.50
 * @file components/shared/OrganizerMatchPanel.tsx
 */

import { useState, useMemo, useCallback } from 'react';
import type { LeagueMatch, GameScore } from '../../types';
import { finaliseResult } from '../../services/firebase/duprScoring';
import { rebuildAllStandingsById } from '../../services/firebase';

// ============================================
// TYPES
// ============================================

type MatchCategory = 'all' | 'needs_review' | 'ready' | 'finalized' | 'disputed';

interface MatchRowData {
  match: LeagueMatch;
  teamAName: string;
  teamBName: string;
  scoreDisplay: string;
  scoreState: string;
  category: MatchCategory;
}

interface OrganizerMatchPanelProps {
  leagueId: string;
  leagueName: string;
  matches: LeagueMatch[];
  isOrganizer: boolean;
  currentUserId: string;
  onMatchClick: (match: LeagueMatch) => void;
  onMatchUpdate?: () => void;
  playerNameLookup?: Map<string, string>; // V07.50: For resolving substitute names
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getScoreStateLabel(match: LeagueMatch): string {
  const state = match.scoreState;
  if (state === 'official' || state === 'submittedToDupr') return 'Finalized';
  if (state === 'signed') return 'Ready to Finalize';
  if (state === 'proposed') return 'Awaiting Confirmation';
  if (state === 'disputed') return 'Disputed';
  if (match.status === 'completed') return 'Finalized';
  if (match.status === 'pending_confirmation') return 'Awaiting Confirmation';
  return 'Scheduled';
}

function getScoreStateBadgeClass(match: LeagueMatch): string {
  const state = match.scoreState;
  if (state === 'official' || state === 'submittedToDupr' || match.status === 'completed') {
    return 'bg-green-500/20 text-green-400';
  }
  if (state === 'signed') return 'bg-cyan-500/20 text-cyan-400';
  if (state === 'proposed' || match.status === 'pending_confirmation') {
    return 'bg-yellow-500/20 text-yellow-400';
  }
  if (state === 'disputed') return 'bg-red-500/20 text-red-400';
  return 'bg-gray-700/50 text-gray-400';
}

function categorizeMatch(match: LeagueMatch): MatchCategory {
  const state = match.scoreState;
  if (state === 'disputed') return 'disputed';
  if (state === 'official' || state === 'submittedToDupr' || match.status === 'completed') return 'finalized';
  if (state === 'signed') return 'ready';
  if (state === 'proposed' || match.status === 'pending_confirmation') return 'needs_review';
  return 'needs_review';
}

function formatScore(scores: GameScore[] | undefined): string {
  if (!scores || scores.length === 0) return '-';
  return scores.map(s => `${s.scoreA ?? 0}-${s.scoreB ?? 0}`).join(', ');
}

// ============================================
// COMPONENT
// ============================================

export function OrganizerMatchPanel({
  leagueId,
  leagueName,
  matches,
  isOrganizer,
  currentUserId,
  onMatchClick,
  onMatchUpdate,
  playerNameLookup,
}: OrganizerMatchPanelProps) {
  const [activeFilter, setActiveFilter] = useState<MatchCategory>('all');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // V07.50: Helper to resolve team name, checking playerNameLookup for "Unknown" names
  const resolveTeamName = useCallback((
    side: { name?: string; playerIds?: string[]; playerNames?: string[] } | undefined,
    fallbackName: string | undefined,
    defaultName: string
  ): string => {
    const storedName = side?.name || fallbackName || defaultName;

    // If name doesn't contain "Unknown", use it as-is
    if (!storedName.includes('Unknown') || !playerNameLookup) {
      return storedName;
    }

    // Try to resolve individual player names from lookup
    const playerIds = side?.playerIds || [];
    const playerNames = side?.playerNames || [];

    const resolvedNames = playerIds.map((id, idx) => {
      const storedPlayerName = playerNames[idx];
      if (storedPlayerName && storedPlayerName !== 'Unknown') {
        return storedPlayerName;
      }
      return playerNameLookup.get(id) || storedPlayerName || 'Unknown';
    });

    if (resolvedNames.length >= 2) {
      return `${resolvedNames[0]} & ${resolvedNames[1]}`;
    } else if (resolvedNames.length === 1) {
      return resolvedNames[0];
    }

    return storedName;
  }, [playerNameLookup]);

  // Build row data for all matches
  const rowData: MatchRowData[] = useMemo(() => {
    return matches.map(match => ({
      match,
      teamAName: resolveTeamName(match.sideA, match.teamAName, 'Team A'),
      teamBName: resolveTeamName(match.sideB, match.teamBName, 'Team B'),
      scoreDisplay: formatScore(match.scores),
      scoreState: getScoreStateLabel(match),
      category: categorizeMatch(match),
    }));
  }, [matches, resolveTeamName]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = rowData.length;
    const needsReview = rowData.filter(r => r.category === 'needs_review').length;
    const ready = rowData.filter(r => r.category === 'ready').length;
    const finalized = rowData.filter(r => r.category === 'finalized').length;
    const disputed = rowData.filter(r => r.category === 'disputed').length;
    return { total, needsReview, ready, finalized, disputed };
  }, [rowData]);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (activeFilter === 'all') return rowData;
    return rowData.filter(r => r.category === activeFilter);
  }, [rowData, activeFilter]);

  // Get matches ready to finalize (signed)
  const readyMatches = useMemo(() => {
    return rowData.filter(r => r.category === 'ready').map(r => r.match);
  }, [rowData]);

  // V07.35: Get matches awaiting confirmation (proposed) that have scores - organizer can force finalize
  const awaitingMatches = useMemo(() => {
    return rowData
      .filter(r => r.category === 'needs_review')
      .map(r => r.match)
      .filter(m => {
        // Must have scores to finalize
        const scores = m.scores || m.scoreProposal?.scores || [];
        return scores.length > 0;
      });
  }, [rowData]);

  // Combined finalizeable matches (both ready and awaiting with scores)
  const allFinalizeable = useMemo(() => {
    return [...readyMatches, ...awaitingMatches];
  }, [readyMatches, awaitingMatches]);

  // Show toast
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // V07.35: Handle individual match finalization
  const handleSingleFinalize = async (match: LeagueMatch, e: React.MouseEvent) => {
    e.stopPropagation();

    const scores = match.scores || match.scoreProposal?.scores || [];
    if (scores.length === 0) {
      showToast('error', 'No scores to finalize');
      return;
    }

    setIsFinalizing(true);
    try {
      // Calculate winner
      let gamesA = 0, gamesB = 0;
      for (const score of scores) {
        if ((score.scoreA ?? 0) > (score.scoreB ?? 0)) gamesA++;
        else if ((score.scoreB ?? 0) > (score.scoreA ?? 0)) gamesB++;
      }
      const winnerId = gamesA > gamesB
        ? (match.sideA?.id || match.teamAId)
        : (match.sideB?.id || match.teamBId);

      await finaliseResult(
        'league',
        leagueId,
        match.id,
        scores,
        winnerId || '',
        currentUserId,
        false
      );

      // V07.35: Recalculate standings after finalizing
      try {
        await rebuildAllStandingsById(leagueId);
        showToast('success', 'Match finalized and standings updated');
      } catch (standingsError) {
        console.error('Failed to recalculate standings:', standingsError);
        showToast('success', 'Match finalized (standings may need manual refresh)');
      }
      onMatchUpdate?.();
    } catch (e: any) {
      console.error('Failed to finalize match:', e);
      showToast('error', e.message || 'Failed to finalize match');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Check if a match can be finalized (has scores and is not already final)
  const canFinalize = (match: LeagueMatch): boolean => {
    const state = match.scoreState;
    if (state === 'official' || state === 'submittedToDupr' || match.status === 'completed') return false;
    const scores = match.scores || match.scoreProposal?.scores || [];
    return scores.length > 0;
  };

  // Handle bulk finalize - V07.35: includes both ready AND awaiting confirmation matches
  const handleBulkFinalize = async () => {
    if (allFinalizeable.length === 0) return;

    setIsFinalizing(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const match of allFinalizeable) {
        try {
          // Use existing scores from the match
          const scores = match.scores || match.scoreProposal?.scores || [];
          if (scores.length === 0) continue;

          // Calculate winner
          let gamesA = 0, gamesB = 0;
          for (const score of scores) {
            if ((score.scoreA ?? 0) > (score.scoreB ?? 0)) gamesA++;
            else if ((score.scoreB ?? 0) > (score.scoreA ?? 0)) gamesB++;
          }
          const winnerId = gamesA > gamesB
            ? (match.sideA?.id || match.teamAId)
            : (match.sideB?.id || match.teamBId);

          await finaliseResult(
            'league',
            leagueId,
            match.id,
            scores,
            winnerId || '',
            currentUserId,
            false // Not DUPR eligible (this is for non-DUPR leagues)
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to finalize match ${match.id}:`, e);
          errorCount++;
        }
      }

      if (successCount > 0) {
        // V07.35: Recalculate standings after finalizing matches
        try {
          await rebuildAllStandingsById(leagueId);
          showToast('success', `Finalized ${successCount} match${successCount !== 1 ? 'es' : ''} and updated standings`);
        } catch (e) {
          console.error('Failed to recalculate standings:', e);
          showToast('success', `Finalized ${successCount} match${successCount !== 1 ? 'es' : ''} (standings may need manual refresh)`);
        }
        onMatchUpdate?.();
      }
      if (errorCount > 0) {
        showToast('error', `Failed to finalize ${errorCount} match${errorCount !== 1 ? 'es' : ''}`);
      }
    } finally {
      setIsFinalizing(false);
    }
  };

  if (!isOrganizer) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-400">Only organizers can access match management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Match Management</h2>
          <p className="text-sm text-gray-400 mt-1">
            Review match scores, finalize official results, and resolve disputes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkFinalize}
            disabled={isFinalizing || allFinalizeable.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isFinalizing ? 'Finalizing...' : `Finalize All (${allFinalizeable.length})`}
          </button>
        </div>
      </div>

      {/* Stats Row - Colored Left Border Style */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveFilter('all')}
          className={`bg-gray-800/50 rounded-lg p-4 border-l-4 border-blue-500 text-left transition-all hover:bg-gray-800 ${
            activeFilter === 'all' ? 'ring-1 ring-blue-500/50' : ''
          }`}
        >
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total</div>
          <div className="text-2xl font-bold text-blue-400">{stats.total}</div>
        </button>

        <button
          onClick={() => setActiveFilter('needs_review')}
          className={`bg-gray-800/50 rounded-lg p-4 border-l-4 border-yellow-500 text-left transition-all hover:bg-gray-800 ${
            activeFilter === 'needs_review' ? 'ring-1 ring-yellow-500/50' : ''
          }`}
        >
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Needs Review</div>
          <div className="text-2xl font-bold text-yellow-400">{stats.needsReview}</div>
        </button>

        <button
          onClick={() => setActiveFilter('ready')}
          className={`bg-gray-800/50 rounded-lg p-4 border-l-4 border-cyan-500 text-left transition-all hover:bg-gray-800 ${
            activeFilter === 'ready' ? 'ring-1 ring-cyan-500/50' : ''
          }`}
        >
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ready</div>
          <div className="text-2xl font-bold text-cyan-400">{stats.ready}</div>
        </button>

        <button
          onClick={() => setActiveFilter('finalized')}
          className={`bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-500 text-left transition-all hover:bg-gray-800 ${
            activeFilter === 'finalized' ? 'ring-1 ring-green-500/50' : ''
          }`}
        >
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Finalized</div>
          <div className="text-2xl font-bold text-green-400">{stats.finalized}</div>
        </button>

        <button
          onClick={() => setActiveFilter('disputed')}
          className={`bg-gray-800/50 rounded-lg p-4 border-l-4 border-red-500 text-left transition-all hover:bg-gray-800 ${
            activeFilter === 'disputed' ? 'ring-1 ring-red-500/50' : ''
          }`}
        >
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Disputed</div>
          <div className="text-2xl font-bold text-red-400">{stats.disputed}</div>
        </button>
      </div>

      {/* Filter Tabs - Underline Style */}
      <div className="flex gap-6 border-b border-gray-700">
        {[
          { key: 'all', label: 'All' },
          { key: 'needs_review', label: 'Needs Review' },
          { key: 'ready', label: 'Ready' },
          { key: 'finalized', label: 'Finalized' },
          { key: 'disputed', label: 'Disputed' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key as MatchCategory)}
            className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
              activeFilter === key
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {label}
            {activeFilter === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-lime-500" />
            )}
          </button>
        ))}
      </div>

      {/* Match Table */}
      <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900/50 border-b border-gray-700/50 text-xs text-gray-500 uppercase tracking-wide">
          <div className="col-span-5">Match</div>
          <div className="col-span-3">Score State</div>
          <div className="col-span-2 text-center">Score</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-gray-700/50">
          {filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No matches in this category
            </div>
          ) : (
            filteredRows.map((row) => (
              <div
                key={row.match.id}
                onClick={() => onMatchClick(row.match)}
                className="grid grid-cols-12 gap-2 px-4 py-4 hover:bg-gray-800/30 cursor-pointer transition-colors items-center"
              >
                {/* Match */}
                <div className="col-span-5">
                  <div className="text-sm text-white font-medium">
                    {row.teamAName} vs {row.teamBName}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {row.match.roundNumber ? `Round ${row.match.roundNumber}` : ''}
                    {row.match.boxNumber ? ` • Box ${row.match.boxNumber}` : ''}
                  </div>
                </div>

                {/* Score State */}
                <div className="col-span-3">
                  <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded ${getScoreStateBadgeClass(row.match)}`}>
                    {row.scoreState}
                  </span>
                </div>

                {/* Score */}
                <div className="col-span-2 text-center">
                  <span className="text-sm font-medium text-lime-400">{row.scoreDisplay}</span>
                </div>

                {/* Actions */}
                <div className="col-span-2 text-right flex items-center justify-end gap-2">
                  {canFinalize(row.match) && (
                    <button
                      onClick={(e) => handleSingleFinalize(row.match, e)}
                      disabled={isFinalizing}
                      className="px-2.5 py-1 text-xs font-medium bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 rounded transition-colors disabled:opacity-50"
                    >
                      Finalize
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMatchClick(row.match);
                    }}
                    className="text-sm text-lime-400 hover:text-lime-300 transition-colors"
                  >
                    Review
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
          toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white`}>
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}
