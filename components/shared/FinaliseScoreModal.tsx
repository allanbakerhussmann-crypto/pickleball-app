/**
 * Finalise Score Modal Component
 *
 * Organizer-only modal for finalizing official match results.
 * Implements the DUPR-compliant workflow:
 * - Can accept player proposal as-is or modify
 * - Creates officialResult and sets scoreLocked
 * - Supports correction workflow with versioning
 * - Sets DUPR eligibility
 *
 * V07.04: Initial implementation for DUPR-compliant scoring
 *
 * FILE LOCATION: components/shared/FinaliseScoreModal.tsx
 * VERSION: V07.04
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ModalShell } from './ModalShell';
import type { Match, GameScore } from '../../types';
import type { GameSettings } from '../../types/game/gameSettings';
import { DEFAULT_GAME_SETTINGS } from '../../types/game/gameSettings';
import { createEmptyGameScore } from '../../services/game';
import { getDisplayScores } from '../../utils/matchHelpers';

// ============================================
// TYPES
// ============================================

interface FinaliseScoreModalProps {
  /** Match to finalize */
  match: Match;
  /** Whether modal is open */
  isOpen: boolean;
  /** Close modal handler */
  onClose: () => void;
  /** Submit finalization handler */
  onSubmit: (
    scores: GameScore[],
    winnerId: string,
    duprEligible: boolean,
    correctionReason?: string
  ) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Is this a correction (match already has officialResult)? */
  isCorrection?: boolean;
}

// ============================================
// SUB-COMPONENTS
// ============================================

/** Score display row */
const ScoreRow: React.FC<{
  gameNumber: number;
  scoreA: number;
  scoreB: number;
  onScoreAChange: (value: number) => void;
  onScoreBChange: (value: number) => void;
  sideAName: string;
  sideBName: string;
  isEditable: boolean;
}> = ({
  gameNumber,
  scoreA,
  scoreB,
  onScoreAChange,
  onScoreBChange,
  sideAName,
  sideBName,
  isEditable,
}) => {
  const sideAWinning = scoreA > scoreB;
  const sideBWinning = scoreB > scoreA;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <div className="w-16 text-center text-sm text-gray-400 font-medium">
        Game {gameNumber}
      </div>

      {/* Side A Score */}
      <div className="flex-1">
        <div className="text-xs text-gray-500 mb-1 truncate">{sideAName}</div>
        {isEditable ? (
          <input
            type="number"
            min="0"
            max="99"
            value={scoreA}
            onChange={e => onScoreAChange(Math.max(0, parseInt(e.target.value) || 0))}
            className={`
              w-full h-10 text-center text-xl font-bold rounded-lg
              bg-gray-900 border transition-all
              focus:outline-none focus:ring-2 focus:ring-lime-500/50
              [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
              ${sideAWinning
                ? 'border-lime-500/50 text-lime-400'
                : 'border-gray-700 text-white'
              }
            `}
          />
        ) : (
          <div className={`
            w-full h-10 flex items-center justify-center text-xl font-bold rounded-lg
            bg-gray-900 border
            ${sideAWinning
              ? 'border-lime-500/50 text-lime-400'
              : 'border-gray-700 text-white'
            }
          `}>
            {scoreA}
          </div>
        )}
      </div>

      <div className="text-gray-500 text-lg font-light">-</div>

      {/* Side B Score */}
      <div className="flex-1">
        <div className="text-xs text-gray-500 mb-1 truncate text-right">{sideBName}</div>
        {isEditable ? (
          <input
            type="number"
            min="0"
            max="99"
            value={scoreB}
            onChange={e => onScoreBChange(Math.max(0, parseInt(e.target.value) || 0))}
            className={`
              w-full h-10 text-center text-xl font-bold rounded-lg
              bg-gray-900 border transition-all
              focus:outline-none focus:ring-2 focus:ring-lime-500/50
              [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
              ${sideBWinning
                ? 'border-lime-500/50 text-lime-400'
                : 'border-gray-700 text-white'
              }
            `}
          />
        ) : (
          <div className={`
            w-full h-10 flex items-center justify-center text-xl font-bold rounded-lg
            bg-gray-900 border
            ${sideBWinning
              ? 'border-lime-500/50 text-lime-400'
              : 'border-gray-700 text-white'
            }
          `}>
            {scoreB}
          </div>
        )}
      </div>
    </div>
  );
};

/** Proposal info banner */
const ProposalBanner: React.FC<{
  match: Match;
}> = ({ match }) => {
  if (!match.scoreProposal) return null;

  const status = match.scoreProposal.status;

  let statusColor = 'text-amber-400';
  let bgColor = 'bg-amber-500/10';
  let borderColor = 'border-amber-500/30';
  let statusText = 'Proposed';

  if (status === 'signed') {
    statusColor = 'text-lime-400';
    bgColor = 'bg-lime-500/10';
    borderColor = 'border-lime-500/30';
    statusText = 'Signed by opponent';
  } else if (status === 'disputed') {
    statusColor = 'text-red-400';
    bgColor = 'bg-red-500/10';
    borderColor = 'border-red-500/30';
    statusText = 'Disputed';
  }

  return (
    <div className={`p-3 rounded-lg border ${bgColor} ${borderColor} mb-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status === 'signed' ? 'bg-lime-400' : status === 'disputed' ? 'bg-red-400' : 'bg-amber-400'}`} />
          <span className={`text-sm font-medium ${statusColor}`}>{statusText}</span>
        </div>
        <span className="text-xs text-gray-500">
          Player proposal
        </span>
      </div>

      {status === 'disputed' && match.scoreProposal.disputeReason && (
        <div className="mt-2 text-sm text-red-300/70 bg-red-500/5 p-2 rounded">
          <span className="font-medium">Dispute reason:</span> {match.scoreProposal.disputeReason}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const FinaliseScoreModal: React.FC<FinaliseScoreModalProps> = ({
  match,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  isCorrection = false,
}) => {
  // Get game settings (merge with defaults for missing values)
  const gameSettings: GameSettings = {
    playType: match.gameSettings?.playType || DEFAULT_GAME_SETTINGS.playType,
    pointsPerGame: match.gameSettings?.pointsPerGame || DEFAULT_GAME_SETTINGS.pointsPerGame,
    winBy: match.gameSettings?.winBy || DEFAULT_GAME_SETTINGS.winBy,
    bestOf: match.gameSettings?.bestOf || DEFAULT_GAME_SETTINGS.bestOf,
    capAt: match.gameSettings?.capAt,
  };

  const bestOf = gameSettings.bestOf || 1;
  const gamesNeededToWin = Math.ceil(bestOf / 2);

  // Initialize scores from proposal or existing
  const [scores, setScores] = useState<GameScore[]>([]);
  const [duprEligible, setDuprEligible] = useState(true);
  const [correctionReason, setCorrectionReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize scores when modal opens
  useEffect(() => {
    if (isOpen) {
      const displayScores = getDisplayScores(match);

      if (displayScores.length > 0) {
        setScores(displayScores);
      } else {
        // Create empty scores for bestOf games
        const emptyScores: GameScore[] = [];
        for (let i = 1; i <= bestOf; i++) {
          emptyScores.push(createEmptyGameScore(i));
        }
        setScores(emptyScores);
        setIsEditing(true);
      }

      // Set DUPR eligibility from match or default true
      setDuprEligible(match.dupr?.eligible !== false);

      // Reset correction reason
      setCorrectionReason('');
      setIsEditing(false);
      setError(null);
    }
  }, [isOpen, match, bestOf]);

  // Calculate winner from scores
  const { winnerId, winnerName, gamesWonA, gamesWonB } = useMemo(() => {
    let winsA = 0;
    let winsB = 0;

    scores.forEach(game => {
      const scoreA = game.scoreA ?? 0;
      const scoreB = game.scoreB ?? 0;
      if (scoreA > scoreB) winsA++;
      else if (scoreB > scoreA) winsB++;
    });

    let winner: string | undefined;
    let wName: string | undefined;

    if (winsA >= gamesNeededToWin) {
      winner = match.sideA?.id;
      wName = match.sideA?.name;
    } else if (winsB >= gamesNeededToWin) {
      winner = match.sideB?.id;
      wName = match.sideB?.name;
    }

    return {
      winnerId: winner,
      winnerName: wName,
      gamesWonA: winsA,
      gamesWonB: winsB,
    };
  }, [scores, gamesNeededToWin, match.sideA, match.sideB]);

  // Update a game score
  const updateScore = (gameIndex: number, side: 'A' | 'B', value: number) => {
    setScores(prev => {
      const updated = [...prev];
      if (side === 'A') {
        updated[gameIndex] = { ...updated[gameIndex], scoreA: value };
      } else {
        updated[gameIndex] = { ...updated[gameIndex], scoreB: value };
      }
      return updated;
    });
    setError(null);
  };

  // Add a game (if needed for best of 3 or 5)
  const addGame = () => {
    if (scores.length < bestOf) {
      setScores(prev => [...prev, createEmptyGameScore(prev.length + 1)]);
    }
  };

  // Remove last game
  const removeGame = () => {
    if (scores.length > 1) {
      setScores(prev => prev.slice(0, -1));
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    // Validate we have a winner
    if (!winnerId) {
      setError('Cannot determine winner. Please ensure scores are correct.');
      return;
    }

    // Validate scores
    const validScores = scores.filter(g => (g.scoreA ?? 0) > 0 || (g.scoreB ?? 0) > 0);
    if (validScores.length === 0) {
      setError('Please enter at least one game score.');
      return;
    }

    // For correction, require reason if already submitted to DUPR
    if (isCorrection && match.dupr?.submitted && !correctionReason.trim()) {
      setError('Please provide a reason for this correction.');
      return;
    }

    try {
      await onSubmit(
        validScores,
        winnerId,
        duprEligible,
        isCorrection ? correctionReason : undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize score');
    }
  };

  const hasProposal = !!match.scoreProposal;
  const isAlreadySubmittedToDupr = match.dupr?.submitted === true;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isCorrection ? 'Correct Official Score' : 'Finalise Official Score'}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {isCorrection
                  ? 'This will create a new version of the official result'
                  : 'Organiser approval required for standings and DUPR'
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70dvh] overflow-y-auto">
          {/* Proposal Banner */}
          {hasProposal && <ProposalBanner match={match} />}

          {/* Already Submitted Warning */}
          {isAlreadySubmittedToDupr && (
            <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30 mb-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-400">Already submitted to DUPR</p>
                  <p className="text-xs text-amber-300/70 mt-1">
                    Corrections will be flagged for re-submission.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Match Info */}
          <div className="mb-4 p-3 rounded-lg bg-gray-800/30 border border-gray-700/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Match</span>
              <span className="text-white font-medium">
                {match.sideA?.name} vs {match.sideB?.name}
              </span>
            </div>
            {match.roundNumber && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-400">Round</span>
                <span className="text-gray-300">{match.roundNumber}</span>
              </div>
            )}
          </div>

          {/* Edit Toggle */}
          {hasProposal && !isEditing && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">Using player proposal scores</span>
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm text-lime-400 hover:text-lime-300 font-medium"
              >
                Modify scores
              </button>
            </div>
          )}

          {/* Scores */}
          <div className="space-y-3 mb-4">
            {scores.map((game, index) => (
              <ScoreRow
                key={index}
                gameNumber={game.gameNumber || index + 1}
                scoreA={game.scoreA ?? 0}
                scoreB={game.scoreB ?? 0}
                onScoreAChange={(val) => updateScore(index, 'A', val)}
                onScoreBChange={(val) => updateScore(index, 'B', val)}
                sideAName={match.sideA?.name || 'Side A'}
                sideBName={match.sideB?.name || 'Side B'}
                isEditable={isEditing || !hasProposal}
              />
            ))}
          </div>

          {/* Add/Remove Game Buttons (for best of 3/5) */}
          {(isEditing || !hasProposal) && bestOf > 1 && (
            <div className="flex gap-2 mb-4">
              {scores.length < bestOf && (
                <button
                  onClick={addGame}
                  className="flex-1 py-2 px-3 text-sm font-medium rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                >
                  + Add Game {scores.length + 1}
                </button>
              )}
              {scores.length > 1 && (
                <button
                  onClick={removeGame}
                  className="flex-1 py-2 px-3 text-sm font-medium rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                >
                  - Remove Game {scores.length}
                </button>
              )}
            </div>
          )}

          {/* Winner Display */}
          <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/50 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Winner</span>
              {winnerId ? (
                <div className="flex items-center gap-2">
                  <span className="text-lime-400 font-semibold">{winnerName}</span>
                  <span className="text-xs text-gray-500">
                    ({gamesWonA} - {gamesWonB} games)
                  </span>
                </div>
              ) : (
                <span className="text-amber-400 text-sm">No winner yet</span>
              )}
            </div>
          </div>

          {/* DUPR Eligibility Toggle */}
          <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/50 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-white">DUPR Eligible</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Can be submitted to DUPR for rating
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuprEligible(!duprEligible)}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${duprEligible ? 'bg-lime-500' : 'bg-gray-700'}
                `}
              >
                <div className={`
                  absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  ${duprEligible ? 'left-7' : 'left-1'}
                `} />
              </button>
            </div>
          </div>

          {/* Correction Reason (if correcting) */}
          {isCorrection && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Correction Reason {isAlreadySubmittedToDupr && <span className="text-red-400">*</span>}
              </label>
              <textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Explain why this score is being corrected..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lime-500/50 focus:border-lime-500/50"
                rows={2}
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 rounded-lg font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !winnerId}
            className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-gray-900 bg-lime-500 hover:bg-lime-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Finalising...</span>
              </>
            ) : (
              <span>{isCorrection ? 'Submit Correction' : 'Finalise Official Score'}</span>
            )}
          </button>
        </div>
    </ModalShell>
  );
};

export default FinaliseScoreModal;
