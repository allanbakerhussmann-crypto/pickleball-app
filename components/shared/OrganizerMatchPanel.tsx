/**
 * OrganizerMatchPanel - Match Management Panel for Non-DUPR Leagues
 *
 * Provides organizer controls for match finalization without DUPR submission.
 * Design mirrors DuprControlPanel but without DUPR-specific features.
 *
 * @version V07.35
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
    return 'bg-gray-700 text-gray-300';
  }
  if (state === 'signed') return 'bg-green-900/50 text-green-400 border border-green-700';
  if (state === 'proposed' || match.status === 'pending_confirmation') {
    return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
  }
  if (state === 'disputed') return 'bg-red-900/50 text-red-400 border border-red-700';
  return 'bg-gray-800 text-gray-400';
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
}: OrganizerMatchPanelProps) {
  const [activeFilter, setActiveFilter] = useState<MatchCategory>('all');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Build row data for all matches
  const rowData: MatchRowData[] = useMemo(() => {
    return matches.map(match => ({
      match,
      teamAName: match.sideA?.name || match.teamAName || 'Team A',
      teamBName: match.sideB?.name || match.teamBName || 'Team B',
      scoreDisplay: formatScore(match.scores),
      scoreState: getScoreStateLabel(match),
      category: categorizeMatch(match),
    }));
  }, [matches]);

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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total */}
        <button
          onClick={() => setActiveFilter('all')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${
            activeFilter === 'all'
              ? 'border-lime-500 bg-lime-900/20'
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-lime-400 uppercase tracking-wide">Total</span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">{stats.total}</span>
        </button>

        {/* Needs Review */}
        <button
          onClick={() => setActiveFilter('needs_review')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${
            activeFilter === 'needs_review'
              ? 'border-yellow-500 bg-yellow-900/20'
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-yellow-400 uppercase tracking-wide">Needs Review</span>
            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">{stats.needsReview}</span>
        </button>

        {/* Ready */}
        <button
          onClick={() => setActiveFilter('ready')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${
            activeFilter === 'ready'
              ? 'border-green-500 bg-green-900/20'
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-green-400 uppercase tracking-wide">Ready</span>
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">{stats.ready}</span>
        </button>

        {/* Finalized */}
        <button
          onClick={() => setActiveFilter('finalized')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${
            activeFilter === 'finalized'
              ? 'border-gray-500 bg-gray-700/50'
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Finalized</span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">{stats.finalized}</span>
        </button>

        {/* Disputed */}
        <button
          onClick={() => setActiveFilter('disputed')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${
            activeFilter === 'disputed'
              ? 'border-red-500 bg-red-900/20'
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Disputed</span>
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">{stats.disputed}</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
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
            className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeFilter === key
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Match Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900/50 border-b border-gray-700 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <div className="col-span-5">Match</div>
          <div className="col-span-3">Score State</div>
          <div className="col-span-2 text-center">Score</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-gray-700">
          {filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No matches in this category
            </div>
          ) : (
            filteredRows.map((row) => (
              <div
                key={row.match.id}
                onClick={() => onMatchClick(row.match)}
                className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-700/50 cursor-pointer transition-colors items-center"
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
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getScoreStateBadgeClass(row.match)}`}>
                    {row.scoreState}
                  </span>
                </div>

                {/* Score */}
                <div className="col-span-2 text-center">
                  <span className="text-sm font-medium text-lime-400">{row.scoreDisplay}</span>
                </div>

                {/* Actions */}
                <div className="col-span-2 text-right flex items-center justify-end gap-1">
                  {canFinalize(row.match) && (
                    <button
                      onClick={(e) => handleSingleFinalize(row.match, e)}
                      disabled={isFinalizing}
                      className="px-2 py-1 text-xs font-medium text-lime-400 hover:text-white hover:bg-lime-600 border border-lime-600 rounded transition-colors disabled:opacity-50"
                    >
                      Finalize
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMatchClick(row.match);
                    }}
                    className="px-2 py-1 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
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
