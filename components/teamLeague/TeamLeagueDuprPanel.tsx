/**
 * TeamLeagueDuprPanel Component
 *
 * DUPR submission panel for team league organizers.
 * Shows board matches eligible for DUPR submission and their status.
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueDuprPanel.tsx
 * VERSION: V07.53
 */

import React, { useState, useMemo } from 'react';
import type {
  TeamLeagueFixture,
  InterclubTeam,
  TeamLeagueSettings,
  FixtureBoardMatch,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeagueDuprPanelProps {
  fixtures: TeamLeagueFixture[];
  _teams?: InterclubTeam[];  // Future: for looking up team names
  settings: TeamLeagueSettings;
  _leagueId?: string;  // Future: for DUPR submission calls
}

interface BoardMatchWithFixture extends FixtureBoardMatch {
  fixtureId: string;
  fixtureName: string;
  weekNumber: number;
}

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueDuprPanel: React.FC<TeamLeagueDuprPanelProps> = ({
  fixtures,
  settings,
}) => {
  const [filter, setFilter] = useState<'all' | 'eligible' | 'submitted' | 'failed'>('all');
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Extract all completed board matches with DUPR eligibility
  const allBoardMatches = useMemo<BoardMatchWithFixture[]>(() => {
    const matches: BoardMatchWithFixture[] = [];

    for (const fixture of fixtures) {
      if (fixture.status !== 'completed') continue;

      for (const board of Object.values(fixture.boards || {})) {
        if (board.status !== 'played') continue;

        matches.push({
          ...board,
          fixtureId: fixture.id,
          fixtureName: `${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
          weekNumber: fixture.weekNumber,
        });
      }
    }

    return matches.sort((a, b) => {
      if (a.weekNumber !== b.weekNumber) return b.weekNumber - a.weekNumber;
      return 0;
    });
  }, [fixtures]);

  // Filter matches
  const filteredMatches = useMemo(() => {
    switch (filter) {
      case 'eligible':
        return allBoardMatches.filter(m => m.dupr?.eligible && !m.dupr?.submittedAt);
      case 'submitted':
        return allBoardMatches.filter(m => m.dupr?.submittedAt);
      case 'failed':
        return allBoardMatches.filter(m => m.dupr?.error);
      default:
        return allBoardMatches;
    }
  }, [allBoardMatches, filter]);

  // Stats
  const stats = useMemo(() => ({
    total: allBoardMatches.length,
    eligible: allBoardMatches.filter(m => m.dupr?.eligible).length,
    submitted: allBoardMatches.filter(m => m.dupr?.submittedAt).length,
    pending: allBoardMatches.filter(m => m.dupr?.eligible && !m.dupr?.submittedAt && !m.dupr?.error).length,
    failed: allBoardMatches.filter(m => m.dupr?.error).length,
  }), [allBoardMatches]);

  // Submit to DUPR (placeholder - would call cloud function)
  const handleSubmit = async (match: BoardMatchWithFixture) => {
    setSubmitting(match.boardMatchId);
    try {
      // TODO: Call dupr_submitBoardMatch cloud function
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Submitting to DUPR:', match.boardMatchId);
    } catch (err) {
      console.error('Error submitting to DUPR:', err);
    } finally {
      setSubmitting(null);
    }
  };

  // Bulk submit eligible matches
  const handleBulkSubmit = async () => {
    const eligibleMatches = allBoardMatches.filter(m => m.dupr?.eligible && !m.dupr?.submittedAt);
    console.log('Bulk submitting', eligibleMatches.length, 'matches');
    // TODO: Implement bulk submission
  };

  // ============================================
  // RENDER
  // ============================================

  if (settings.duprMode === 'none') {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
        <div className="text-5xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-white mb-2">DUPR Not Enabled</h3>
        <p className="text-gray-400">
          This league is not configured for DUPR submissions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 text-center">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-xs text-gray-400">Total Matches</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.eligible}</div>
          <div className="text-xs text-gray-400">DUPR Eligible</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 text-center">
          <div className="text-2xl font-bold text-lime-400">{stats.submitted}</div>
          <div className="text-xs text-gray-400">Submitted</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{stats.pending}</div>
          <div className="text-xs text-gray-400">Pending</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
          <div className="text-xs text-gray-400">Failed</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {/* Filter */}
        <div className="flex gap-2">
          {(['all', 'eligible', 'submitted', 'failed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${filter === f
                  ? 'bg-lime-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              `}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'eligible' && stats.pending > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500 text-white text-xs rounded-full">
                  {stats.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Bulk submit */}
        {stats.pending > 0 && (
          <button
            onClick={handleBulkSubmit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Submit All ({stats.pending})
          </button>
        )}
      </div>

      {/* Matches list */}
      {filteredMatches.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 text-center">
          <p className="text-gray-400">No matches found matching your filter.</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 divide-y divide-gray-700/50">
          {filteredMatches.map(match => (
            <div key={match.boardMatchId} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Match header */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">
                      Week {match.weekNumber}
                    </span>
                    <span className="text-sm text-gray-400">Board {match.boardNumber}</span>
                  </div>

                  {/* Fixture name */}
                  <div className="text-white font-medium">{match.fixtureName}</div>

                  {/* Players */}
                  <div className="text-sm text-gray-400 mt-1">
                    {(match.homePlayerNames || []).join(' & ')}
                    <span className="mx-2 text-gray-600">vs</span>
                    {(match.awayPlayerNames || []).join(' & ')}
                  </div>

                  {/* Score */}
                  <div className="flex gap-1 mt-2">
                    {(match.scores || []).map((game, idx) => (
                      <span
                        key={idx}
                        className={`
                          px-2 py-0.5 rounded text-xs font-mono
                          ${game.scoreA > game.scoreB
                            ? 'bg-lime-600/30 text-lime-300'
                            : 'bg-red-600/30 text-red-300'
                          }
                        `}
                      >
                        {game.scoreA}-{game.scoreB}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Status and actions */}
                <div className="ml-4 flex flex-col items-end gap-2">
                  {/* Status badge */}
                  {match.dupr?.submittedAt ? (
                    <span className="px-2 py-1 bg-lime-600/20 text-lime-400 text-xs rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Submitted
                    </span>
                  ) : match.dupr?.error ? (
                    <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded-full">
                      Failed
                    </span>
                  ) : match.dupr?.eligible ? (
                    <span className="px-2 py-1 bg-amber-600/20 text-amber-400 text-xs rounded-full">
                      Pending
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs rounded-full">
                      Not Eligible
                    </span>
                  )}

                  {/* Submit button */}
                  {match.dupr?.eligible && !match.dupr?.submittedAt && (
                    <button
                      onClick={() => handleSubmit(match)}
                      disabled={submitting === match.boardMatchId}
                      className={`
                        px-3 py-1.5 text-sm rounded-lg transition-colors
                        ${submitting === match.boardMatchId
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }
                      `}
                    >
                      {submitting === match.boardMatchId ? 'Submitting...' : 'Submit'}
                    </button>
                  )}

                  {/* Retry button for failed */}
                  {match.dupr?.error && (
                    <button
                      onClick={() => handleSubmit(match)}
                      disabled={submitting === match.boardMatchId}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>

              {/* Error message */}
              {match.dupr?.error && (
                <div className="mt-2 px-3 py-2 bg-red-900/30 border border-red-600/30 rounded-lg text-sm text-red-300">
                  {match.dupr.error}
                </div>
              )}

              {/* DUPR eligibility info */}
              {!match.dupr?.eligible && !match.dupr?.submittedAt && (
                <div className="mt-2 text-xs text-gray-500">
                  Not eligible: All players must have linked DUPR accounts
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamLeagueDuprPanel;
