/**
 * BoxLeagueScoreModal Component V05.38
 * 
 * Modal for entering match scores in Box League format.
 * Shows both teams with their rotating partners and allows score entry.
 * 
 * FILE LOCATION: components/leagues/BoxLeagueScoreModal.tsx
 * VERSION: V05.38
 */

import React, { useState, useEffect } from 'react';
import { enterBoxLeagueScore } from '../../services/firebase/boxLeague';
import type { BoxLeagueMatch, BoxLeagueSettings } from '../../types/boxLeague';

// ============================================
// TYPES
// ============================================

interface BoxLeagueScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: BoxLeagueMatch;
  leagueId: string;
  settings: BoxLeagueSettings;
  currentUserId: string;
  currentUserName: string;
  onSuccess?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const BoxLeagueScoreModal: React.FC<BoxLeagueScoreModalProps> = ({
  isOpen,
  onClose,
  match,
  leagueId,
  settings,
  currentUserId,
  currentUserName,
  onSuccess,
}) => {
  const [team1Score, setTeam1Score] = useState<number>(0);
  const [team2Score, setTeam2Score] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setTeam1Score(match.team1Score || 0);
      setTeam2Score(match.team2Score || 0);
      setError(null);
    }
  }, [isOpen, match]);

  if (!isOpen) return null;

  const gamesTo = settings.gamesTo;
  const winBy = settings.winBy;

  // Validate score
  const validateScore = (): string | null => {
    if (team1Score === team2Score) {
      return 'Scores cannot be tied - there must be a winner';
    }
    
    const higherScore = Math.max(team1Score, team2Score);
    const lowerScore = Math.min(team1Score, team2Score);
    
    // Check if winner reached target
    if (higherScore < gamesTo) {
      return `Winner must reach at least ${gamesTo} points`;
    }
    
    // Check win-by margin
    if (winBy === 2 && higherScore - lowerScore < 2 && higherScore < gamesTo + 10) {
      // Allow deuce scenarios up to reasonable cap
      if (higherScore - lowerScore !== 2) {
        return 'Winner must win by 2 points (or cap at reasonable score)';
      }
    }
    
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateScore();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await enterBoxLeagueScore(leagueId, {
        matchId: match.id,
        team1Score,
        team2Score,
        enteredByUserId: currentUserId,
        enteredByName: currentUserName,
        playedAt: Date.now(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save score');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save score');
    } finally {
      setLoading(false);
    }
  };

  const winningTeam = team1Score > team2Score ? 1 : team2Score > team1Score ? 2 : null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Enter Match Score</h2>
              <p className="text-sm text-gray-400 mt-1">
                Week {match.weekNumber} • Box {match.boxNumber} • Match {match.matchNumberInBox}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Match Info */}
        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Score Entry */}
          <div className="space-y-6">
            {/* Team 1 */}
            <div className={`p-4 rounded-xl border-2 transition-colors ${
              winningTeam === 1 
                ? 'border-green-500 bg-green-900/20' 
                : 'border-gray-700 bg-gray-900/50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Team 1</div>
                  <div className="text-white font-semibold">
                    {match.team1Player1Name}
                  </div>
                  <div className="text-gray-400 text-sm">
                    & {match.team1Player2Name}
                  </div>
                </div>
                {winningTeam === 1 && (
                  <span className="text-green-400 text-2xl">🏆</span>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400">Score:</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTeam1Score(Math.max(0, team1Score - 1))}
                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-xl"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={team1Score}
                    onChange={(e) => setTeam1Score(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 h-12 bg-gray-900 border border-gray-600 text-white text-center text-2xl font-bold rounded-lg focus:outline-none focus:border-blue-500"
                    min={0}
                    max={99}
                  />
                  <button
                    onClick={() => setTeam1Score(team1Score + 1)}
                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-xl"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center">
              <div className="bg-gray-700 text-gray-400 px-4 py-1 rounded-full text-sm font-medium">
                VS
              </div>
            </div>

            {/* Team 2 */}
            <div className={`p-4 rounded-xl border-2 transition-colors ${
              winningTeam === 2 
                ? 'border-green-500 bg-green-900/20' 
                : 'border-gray-700 bg-gray-900/50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Team 2</div>
                  <div className="text-white font-semibold">
                    {match.team2Player1Name}
                  </div>
                  <div className="text-gray-400 text-sm">
                    & {match.team2Player2Name}
                  </div>
                </div>
                {winningTeam === 2 && (
                  <span className="text-green-400 text-2xl">🏆</span>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400">Score:</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTeam2Score(Math.max(0, team2Score - 1))}
                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-xl"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={team2Score}
                    onChange={(e) => setTeam2Score(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 h-12 bg-gray-900 border border-gray-600 text-white text-center text-2xl font-bold rounded-lg focus:outline-none focus:border-blue-500"
                    min={0}
                    max={99}
                  />
                  <button
                    onClick={() => setTeam2Score(team2Score + 1)}
                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-xl"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Score Buttons */}
          <div className="mt-6">
            <div className="text-xs text-gray-500 mb-2">Quick scores (games to {gamesTo}):</div>
            <div className="flex flex-wrap gap-2">
              {[
                [gamesTo, gamesTo - 4],
                [gamesTo, gamesTo - 3],
                [gamesTo, gamesTo - 2],
                [gamesTo + 1, gamesTo - 1],
                [gamesTo - 4, gamesTo],
                [gamesTo - 3, gamesTo],
                [gamesTo - 2, gamesTo],
                [gamesTo - 1, gamesTo + 1],
              ].filter(([a, b]) => a > 0 && b > 0 && a >= 0 && b >= 0).map(([t1, t2], idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTeam1Score(t1);
                    setTeam2Score(t2);
                  }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded text-sm transition-colors"
                >
                  {t1}-{t2}
                </button>
              ))}
            </div>
          </div>

          {/* Point Allocation Preview */}
          {winningTeam && (
            <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Points will be allocated:
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 mb-1">{match.team1Player1Name}</div>
                  <div className={winningTeam === 1 ? 'text-green-400' : 'text-red-400'}>
                    {winningTeam === 1 ? '+1 Win' : '+0 Wins'} • +{team1Score} PF • +{team2Score} PA
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">{match.team1Player2Name}</div>
                  <div className={winningTeam === 1 ? 'text-green-400' : 'text-red-400'}>
                    {winningTeam === 1 ? '+1 Win' : '+0 Wins'} • +{team1Score} PF • +{team2Score} PA
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">{match.team2Player1Name}</div>
                  <div className={winningTeam === 2 ? 'text-green-400' : 'text-red-400'}>
                    {winningTeam === 2 ? '+1 Win' : '+0 Wins'} • +{team2Score} PF • +{team1Score} PA
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">{match.team2Player2Name}</div>
                  <div className={winningTeam === 2 ? 'text-green-400' : 'text-red-400'}>
                    {winningTeam === 2 ? '+1 Win' : '+0 Wins'} • +{team2Score} PF • +{team1Score} PA
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !winningTeam}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:bg-gray-600 flex items-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              '✓ Save Score'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BoxLeagueScoreModal;