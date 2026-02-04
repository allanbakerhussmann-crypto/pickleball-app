/**
 * DuprReviewModal - Organizer modal for reviewing and finalizing scores
 *
 * Shows:
 * - Team snapshot with player names
 * - Score proposal (if exists)
 * - Signed/disputed status
 * - Score editor
 * - DUPR eligibility toggle
 * - Finalise button
 *
 * V07.50: Block score editing after match submitted to DUPR (scores are immutable)
 * V07.33: DUPR Compliance - Block finalization until opponent signs
 * - Opponent acknowledgement is REQUIRED before organizer can finalize
 * - Sequence: Propose → Sign → Finalize
 *
 * V07.53: Allow organizers NOT in match to finalize directly
 * - If organizer is NOT a participant: Can finalize without opponent signing (not self-reporting)
 * - If organizer IS a participant: Must wait for opponent to sign (anti-self-reporting)
 *
 * @version V07.53
 * @file components/shared/DuprReviewModal.tsx
 */

import { useState, useEffect, useMemo } from 'react';
import type { GameScore } from '../../types';
import type { DuprReviewModalData } from '../../types/duprPanel';
import type { GameSettings } from '../../types/game/gameSettings';
import { ModalShell } from './ModalShell';

interface DuprReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DuprReviewModalData | null;
  onFinalise: (
    matchId: string,
    scores: GameScore[],
    winnerId: string,
    duprEligible: boolean
  ) => Promise<void>;
  isSaving: boolean;
  isOrganizer?: boolean; // V07.50: Permission check
  currentUserId?: string; // V07.53: For checking if organizer is participant
}

// ============================================
// SCORE VALIDATION
// ============================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * V07.50: Validate a single game score against game settings
 */
function validateGameScore(
  scoreA: number,
  scoreB: number,
  gameNumber: number,
  settings: GameSettings
): { valid: boolean; error?: string; warning?: string } {
  const { pointsPerGame, winBy, capAt } = settings;
  const maxScore = Math.max(scoreA, scoreB);
  const minScore = Math.min(scoreA, scoreB);
  const margin = maxScore - minScore;

  // Check for tie (not allowed)
  if (scoreA === scoreB) {
    return { valid: false, error: `Game ${gameNumber}: Tied scores are not allowed` };
  }

  // Check if max score is at least pointsPerGame
  if (maxScore < pointsPerGame) {
    return {
      valid: false,
      error: `Game ${gameNumber}: Winning score must be at least ${pointsPerGame} (current: ${maxScore}-${minScore})`
    };
  }

  // Check win-by margin
  if (winBy === 2 && margin < 2) {
    // Unless capped
    if (capAt && maxScore >= capAt) {
      // Capped game, margin of 1 is OK
      return { valid: true, warning: `Game ${gameNumber}: Capped at ${capAt}` };
    }
    return {
      valid: false,
      error: `Game ${gameNumber}: Must win by ${winBy} (current margin: ${margin})`
    };
  }

  // Check if score is reasonable (loser shouldn't have more than pointsPerGame - 1 unless deuce)
  if (maxScore > pointsPerGame && minScore < pointsPerGame - winBy) {
    return {
      valid: false,
      error: `Game ${gameNumber}: Invalid score - if winner has ${maxScore}, loser should have at least ${maxScore - winBy}`
    };
  }

  return { valid: true };
}

/**
 * V07.50: Validate all scores against game settings
 */
function validateScores(scores: GameScore[], settings: GameSettings): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check number of games
  const { bestOf } = settings;
  const gamesNeededToWin = Math.ceil(bestOf / 2);

  // Count games won by each side
  let gamesWonA = 0;
  let gamesWonB = 0;

  for (let i = 0; i < scores.length; i++) {
    const game = scores[i];
    const result = validateGameScore(game.scoreA || 0, game.scoreB || 0, i + 1, settings);

    if (!result.valid && result.error) {
      errors.push(result.error);
    }
    if (result.warning) {
      warnings.push(result.warning);
    }

    if ((game.scoreA || 0) > (game.scoreB || 0)) {
      gamesWonA++;
    } else {
      gamesWonB++;
    }
  }

  // Check if match is complete (someone won the required games)
  const maxGamesWon = Math.max(gamesWonA, gamesWonB);
  if (maxGamesWon < gamesNeededToWin) {
    errors.push(`Match incomplete: Need ${gamesNeededToWin} game wins for best-of-${bestOf} (current: ${gamesWonA}-${gamesWonB})`);
  }

  // Check if too many games
  if (scores.length > bestOf) {
    errors.push(`Too many games: Best-of-${bestOf} should have at most ${bestOf} games`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function DuprReviewModal({
  isOpen,
  onClose,
  data,
  onFinalise,
  isSaving,
  isOrganizer = true, // V07.50: Default true for backward compatibility
  currentUserId, // V07.53: For checking if organizer is participant
}: DuprReviewModalProps) {
  // Local state for editing
  const [scores, setScores] = useState<GameScore[]>([]);
  const [winnerId, setWinnerId] = useState<string>('');
  const [duprEligible, setDuprEligible] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Initialize state from data
  useEffect(() => {
    if (data) {
      // Use proposal scores if available, otherwise official
      const initialScores = data.proposal?.scores || data.official?.scores || [];
      setScores(initialScores.length > 0 ? [...initialScores] : [{ gameNumber: 1, scoreA: 0, scoreB: 0 }]);
      setWinnerId(data.proposal?.winnerId || data.official?.winnerId || '');
      setDuprEligible(data.match.dupr?.eligible !== false);
      setIsEditing(false);
    }
  }, [data]);

  // V07.50: Get game settings for validation with defaults
  const rawGameSettings = data?.match?.gameSettings;
  const gameSettings: GameSettings | null = rawGameSettings ? {
    playType: rawGameSettings.playType || 'doubles',
    pointsPerGame: rawGameSettings.pointsPerGame || 11,
    winBy: rawGameSettings.winBy || 2,
    bestOf: rawGameSettings.bestOf || 1,
    capAt: rawGameSettings.capAt,
  } : null;

  // V07.50: Validate scores whenever they change
  const validation = useMemo(() => {
    if (!gameSettings || scores.length === 0) {
      return { valid: true, errors: [], warnings: [] };
    }
    return validateScores(scores, gameSettings);
  }, [scores, gameSettings]);

  // V07.53: Check if the organizer is a participant in this match
  // IMPORTANT: This hook must be BEFORE any early returns to comply with React hooks rules
  const isOrganizerParticipant = useMemo(() => {
    if (!currentUserId || !data?.match) return false;
    const sideAPlayerIds = data.match.sideA?.playerIds || [];
    const sideBPlayerIds = data.match.sideB?.playerIds || [];
    return sideAPlayerIds.includes(currentUserId) || sideBPlayerIds.includes(currentUserId);
  }, [currentUserId, data?.match]);

  if (!isOpen || !data) return null;

  // V07.50: Permission check - show read-only view for non-organizers
  if (!isOrganizer) {
    return (
      <ModalShell isOpen={true} onClose={onClose}>
        <div className="p-6">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-lg font-semibold text-white mb-2">Access Denied</h3>
            <p className="text-gray-400 mb-4">Only organizers can review and finalize match scores.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  const { match, proposal, official } = data;
  const sideAName = match.sideA?.name || 'Side A';
  const sideBName = match.sideB?.name || 'Side B';
  const sideAId = match.sideA?.id || '';
  const sideBId = match.sideB?.id || '';

  // V07.50: Check if match has been submitted to DUPR (scores are immutable)
  const isSubmittedToDupr = Boolean(
    match.dupr?.submitted ||
    match.scoreState === 'submittedToDupr'
  );

  // Calculate winner from scores
  const calculateWinner = (gameScores: GameScore[]): string => {
    let gamesA = 0;
    let gamesB = 0;
    for (const game of gameScores) {
      if ((game.scoreA || 0) > (game.scoreB || 0)) gamesA++;
      else if ((game.scoreB || 0) > (game.scoreA || 0)) gamesB++;
    }
    return gamesA > gamesB ? sideAId : gamesB > gamesA ? sideBId : '';
  };

  // Handle score change
  const handleScoreChange = (gameIndex: number, field: 'scoreA' | 'scoreB', value: number) => {
    const newScores = [...scores];
    newScores[gameIndex] = { ...newScores[gameIndex], [field]: value };
    setScores(newScores);
    setWinnerId(calculateWinner(newScores));
  };

  // Add a game
  const addGame = () => {
    setScores([...scores, { gameNumber: scores.length + 1, scoreA: 0, scoreB: 0 }]);
  };

  // Remove a game
  const removeGame = (index: number) => {
    if (scores.length > 1) {
      const newScores = scores.filter((_, i) => i !== index).map((s, i) => ({ ...s, gameNumber: i + 1 }));
      setScores(newScores);
      setWinnerId(calculateWinner(newScores));
    }
  };

  // V07.33/V07.53: DUPR Compliance - Check if opponent has signed
  // Finalization is ONLY allowed if:
  // 1. There's no proposal (organizer entering directly), OR
  // 2. The proposal status is 'signed' (opponent acknowledged), OR
  // 3. V07.53: Organizer is NOT a participant (not self-reporting, can finalize directly)
  const isProposalSigned = !proposal || proposal.status === 'signed' || !isOrganizerParticipant;

  // V07.50: Include validation in canFinalise check
  const canFinalise = winnerId && isProposalSigned && validation.valid;

  // Handle finalise
  const handleFinalise = async () => {
    if (!winnerId) {
      alert('Cannot finalize: No winner determined');
      return;
    }
    // V07.33/V07.53: Block if opponent hasn't signed AND organizer is a participant
    // If organizer is NOT a participant, they can finalize directly (not self-reporting)
    if (proposal && proposal.status !== 'signed' && isOrganizerParticipant) {
      alert('Cannot finalize: Opponent must acknowledge the score first. This is required for DUPR compliance (anti-self-reporting).');
      return;
    }
    // V07.50: Block if validation fails
    if (!validation.valid) {
      alert(`Cannot finalize: ${validation.errors.join(', ')}`);
      return;
    }
    await onFinalise(match.id, scores, winnerId, duprEligible);
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <ModalShell isOpen={true} onClose={onClose} maxWidth="max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {official ? 'Review Official Result' : 'Finalise Score'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70dvh] overflow-y-auto">
          {/* Teams */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border ${winnerId === sideAId ? 'border-lime-500 bg-lime-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <p className="text-xs text-gray-500 uppercase">Side A</p>
              <p className="text-lg font-semibold text-white">{sideAName}</p>
              {data.sideAPlayerNames.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  {data.sideAPlayerNames.join(', ')}
                </p>
              )}
              {winnerId === sideAId && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-lime-500 text-gray-900 rounded">
                  Winner
                </span>
              )}
            </div>
            <div className={`p-4 rounded-xl border ${winnerId === sideBId ? 'border-lime-500 bg-lime-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <p className="text-xs text-gray-500 uppercase">Side B</p>
              <p className="text-lg font-semibold text-white">{sideBName}</p>
              {data.sideBPlayerNames.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  {data.sideBPlayerNames.join(', ')}
                </p>
              )}
              {winnerId === sideBId && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-lime-500 text-gray-900 rounded">
                  Winner
                </span>
              )}
            </div>
          </div>

          {/* Proposal Info (if exists) */}
          {proposal && (
            <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Score Proposal</p>
                  <p className="text-sm text-gray-300 mt-1">
                    Entered by {proposal.enteredByName || 'Unknown'} on{' '}
                    {formatDate(proposal.enteredAt)}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  proposal.status === 'signed' ? 'bg-lime-500/20 text-lime-400' :
                  proposal.status === 'disputed' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {proposal.status}
                </span>
              </div>

              {proposal.status === 'signed' && proposal.signedByName && (
                <p className="text-sm text-lime-400 mt-2">
                  Signed by {proposal.signedByName} on {formatDate(proposal.signedAt!)}
                </p>
              )}

              {proposal.status === 'disputed' && (
                <div className="mt-2 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                  <p className="text-sm text-red-400">
                    <strong>Disputed by:</strong> {proposal.disputedByName || 'Unknown'}
                  </p>
                  {proposal.disputeReason && (
                    <p className="text-sm text-red-300 mt-1">
                      <strong>Reason:</strong> {proposal.disputeReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* V07.50: Game Settings Info */}
          {gameSettings && (
            <div className="flex items-center gap-4 text-xs text-gray-500 px-3 py-2 bg-gray-800/50 rounded-lg">
              <span>Game to <strong className="text-gray-400">{gameSettings.pointsPerGame}</strong></span>
              <span>Win by <strong className="text-gray-400">{gameSettings.winBy}</strong></span>
              <span>Best of <strong className="text-gray-400">{gameSettings.bestOf}</strong></span>
              {gameSettings.capAt && <span>Cap at <strong className="text-gray-400">{gameSettings.capAt}</strong></span>}
            </div>
          )}

          {/* Scores Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">
                {isEditing ? 'Edit Scores' : 'Scores'}
              </p>
              {/* V07.50: Hide edit toggle when submitted to DUPR */}
              {!official && !isSubmittedToDupr && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {isEditing ? 'Use Proposal' : 'Edit Scores'}
                </button>
              )}
              {isSubmittedToDupr && (
                <span className="text-xs text-gray-500">
                  Submitted to DUPR
                </span>
              )}
            </div>

            <div className="space-y-2">
              {scores.map((game, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">Game {index + 1}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={game.scoreA || 0}
                      onChange={(e) => handleScoreChange(index, 'scoreA', parseInt(e.target.value) || 0)}
                      disabled={isSubmittedToDupr || (!isEditing && !official)}
                      className="w-16 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-center text-white disabled:opacity-50"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={game.scoreB || 0}
                      onChange={(e) => handleScoreChange(index, 'scoreB', parseInt(e.target.value) || 0)}
                      disabled={isSubmittedToDupr || (!isEditing && !official)}
                      className="w-16 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-center text-white disabled:opacity-50"
                    />
                  </div>
                  {isEditing && scores.length > 1 && (
                    <button
                      onClick={() => removeGame(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isEditing && (
              <button
                onClick={addGame}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + Add Game
              </button>
            )}

            {/* V07.50: Validation Errors */}
            {validation.errors.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs font-medium text-red-400 mb-1">Score Validation Errors:</p>
                <ul className="text-xs text-red-300 space-y-0.5">
                  {validation.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* V07.50: Validation Warnings */}
            {validation.warnings.length > 0 && validation.errors.length === 0 && (
              <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs font-medium text-yellow-400 mb-1">Warnings:</p>
                <ul className="text-xs text-yellow-300 space-y-0.5">
                  {validation.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* DUPR Eligibility */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-700 bg-gray-800/50">
            <div>
              <p className="text-sm font-medium text-white">DUPR Eligible</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Submit this match result to DUPR for rating calculation
              </p>
            </div>
            <button
              onClick={() => setDuprEligible(!duprEligible)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${duprEligible ? 'bg-lime-500' : 'bg-gray-600'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${duprEligible ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 bg-gray-800/50">
          {/* V07.33/V07.53: DUPR Compliance Warning - Only show when organizer IS a participant */}
          {/* If organizer is NOT a participant, they can finalize directly (not self-reporting) */}
          {proposal && proposal.status === 'proposed' && isOrganizerParticipant && (
            <div className="px-6 py-3 bg-amber-900/30 border-b border-amber-600/30">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-300">Awaiting Opponent Acknowledgement</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    DUPR requires the opponent to sign/acknowledge the score before you can finalize.
                    The opponent must click "Sign to Acknowledge" first.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalise}
              disabled={isSaving || !canFinalise}
              className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
                ${!isSaving && canFinalise
                  ? 'bg-lime-500 text-gray-900 hover:bg-lime-400'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Finalise Official Result'
              )}
            </button>
          </div>
        </div>
      </ModalShell>
  );
}

export default DuprReviewModal;
