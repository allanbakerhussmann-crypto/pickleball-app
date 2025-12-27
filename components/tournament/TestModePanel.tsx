/**
 * TestModePanel - Testing features panel for Admin Test Mode
 *
 * Provides quick actions for testing tournament functionality:
 * - Quick Score: Set match scores directly
 * - Simulate Pool: Complete all pool matches with random scores
 * - Clear Test Data: Remove all test-flagged scores
 * - Reset Match: Clear individual match score
 *
 * @version 06.03
 * @file components/tournament/TestModePanel.tsx
 */

import React, { useState } from 'react';
import type { Match, Team } from '../../types';

interface TestModePanelProps {
  tournamentId: string;
  divisionId: string;
  matches: Match[];
  teams: Team[];
  onClearTestData: () => Promise<number>;
  onQuickScore: (matchId: string, scoreA: number, scoreB: number) => Promise<void>;
  onSimulatePool?: (poolName: string) => Promise<void>;
  onResetMatch?: (matchId: string) => Promise<void>;
  onDeleteCorruptedMatches?: () => Promise<number>;
}

export const TestModePanel: React.FC<TestModePanelProps> = ({
  tournamentId,
  divisionId,
  matches,
  teams,
  onClearTestData,
  onQuickScore,
  onSimulatePool,
  onResetMatch,
  onDeleteCorruptedMatches,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [quickScoreA, setQuickScoreA] = useState<number>(11);
  const [quickScoreB, setQuickScoreB] = useState<number>(5);
  const [isScoring, setIsScoring] = useState(false);
  const [isDeletingCorrupted, setIsDeletingCorrupted] = useState(false);

  // Get scheduled matches that can be scored
  const scheduledMatches = matches.filter(m =>
    m.status === 'scheduled' || m.status === 'in_progress'
  );

  // Get unique pool names
  const poolNames = Array.from(new Set(
    matches
      .filter(m => m.poolGroup)
      .map(m => m.poolGroup!)
  )).sort();

  const handleClearTestData = async () => {
    setIsClearing(true);
    setClearResult(null);
    try {
      const count = await onClearTestData();
      setClearResult(`Cleared ${count} test match${count !== 1 ? 'es' : ''}`);
      setTimeout(() => setClearResult(null), 3000);
    } catch (err) {
      setClearResult('Failed to clear test data');
      console.error('Clear test data error:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleQuickScore = async () => {
    if (!selectedMatchId) return;
    setIsScoring(true);
    try {
      await onQuickScore(selectedMatchId, quickScoreA, quickScoreB);
      setSelectedMatchId('');
    } catch (err) {
      console.error('Quick score error:', err);
    } finally {
      setIsScoring(false);
    }
  };

  const getTeamName = (teamId: string | undefined): string => {
    if (!teamId) return 'TBD';
    const team = teams.find(t => t.id === teamId);
    return team?.teamName || `Team ${teamId.slice(0, 4)}`;
  };

  return (
    <div className="bg-yellow-900/30 border-2 border-yellow-600/50 rounded-lg mb-4">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🧪</span>
          <span className="text-yellow-300 font-bold">Test Mode Tools</span>
          <span className="text-xs text-gray-400">
            ({scheduledMatches.length} matches available)
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-yellow-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-yellow-600/30 pt-4">
          {/* Quick Score Section */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-yellow-300 mb-2">Quick Score Match</h4>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <select
                  value={selectedMatchId}
                  onChange={(e) => setSelectedMatchId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                >
                  <option value="">Select a match...</option>
                  {scheduledMatches.map(match => (
                    <option key={match.id} value={match.id}>
                      {getTeamName(match.team1Id)} vs {getTeamName(match.team2Id)}
                      {match.poolGroup && ` (${match.poolGroup})`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={21}
                  value={quickScoreA}
                  onChange={(e) => setQuickScoreA(Number(e.target.value))}
                  className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-2 text-center text-sm"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  min={0}
                  max={21}
                  value={quickScoreB}
                  onChange={(e) => setQuickScoreB(Number(e.target.value))}
                  className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-2 text-center text-sm"
                />
              </div>
              <button
                onClick={handleQuickScore}
                disabled={!selectedMatchId || isScoring}
                className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium px-4 py-2 rounded text-sm transition-colors"
              >
                {isScoring ? 'Scoring...' : 'Set Score'}
              </button>
            </div>
          </div>

          {/* Simulate Pool Section */}
          {poolNames.length > 0 && onSimulatePool && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-yellow-300 mb-2">Simulate Pool Completion</h4>
              <div className="flex flex-wrap gap-2">
                {poolNames.map(poolName => (
                  <button
                    key={poolName}
                    onClick={() => onSimulatePool(poolName)}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded text-sm transition-colors"
                  >
                    Complete {poolName}
                  </button>
                ))}
                <button
                  onClick={() => onSimulatePool('all')}
                  className="bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
                >
                  Complete All Pools
                </button>
              </div>
            </div>
          )}

          {/* Clear Test Data Section */}
          <div className="bg-red-900/30 rounded-lg p-3 border border-red-700/30">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-red-300">Clear Test Data</h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Reset all test-flagged matches to scheduled status
                </p>
              </div>
              <button
                onClick={handleClearTestData}
                disabled={isClearing}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded text-sm transition-colors"
              >
                {isClearing ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
            {clearResult && (
              <p className="text-sm text-yellow-300 mt-2">{clearResult}</p>
            )}
          </div>

          {/* Delete Corrupted Matches Section */}
          {onDeleteCorruptedMatches && (
            <div className="bg-orange-900/30 rounded-lg p-3 border border-orange-700/30">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-orange-300">Delete Corrupted Matches</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Remove matches where same team is on both sides (data corruption)
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setIsDeletingCorrupted(true);
                    try {
                      const count = await onDeleteCorruptedMatches();
                      setClearResult(`Deleted ${count} corrupted match${count !== 1 ? 'es' : ''}`);
                      setTimeout(() => setClearResult(null), 3000);
                    } catch (err) {
                      setClearResult('Failed to delete corrupted matches');
                      console.error('Delete corrupted matches error:', err);
                    } finally {
                      setIsDeletingCorrupted(false);
                    }
                  }}
                  disabled={isDeletingCorrupted}
                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded text-sm transition-colors"
                >
                  {isDeletingCorrupted ? 'Deleting...' : 'Delete Corrupted'}
                </button>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="text-xs text-gray-400 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>
              All scores entered in test mode are flagged with <code className="bg-gray-800 px-1 rounded">testData: true</code>
              and can be bulk cleared using the button above.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestModePanel;
