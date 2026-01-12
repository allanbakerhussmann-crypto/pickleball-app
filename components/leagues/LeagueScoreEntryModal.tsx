/**
 * LeagueScoreEntryModal Component V07.35
 *
 * Modal for entering league match scores with game-by-game entry.
 * Supports best of 1, 3, or 5 games with validation.
 *
 * V07.35: DUPR compliance rules only apply to DUPR-enabled leagues, +/- stepper buttons
 * V07.34: Replaced picker wheel with +/- stepper buttons for easier score entry
 * V07.33: Added vertical score picker wheel for touch-friendly input
 * V07.04: DUPR-Compliant Scoring
 * - Players "Propose Score" → opponents "Sign to Acknowledge" → organizers finalize
 * - Uses proposeScore, signScore from duprScoring service
 * - Updated UI labels per DUPR compliance requirements
 *
 * FILE LOCATION: components/leagues/LeagueScoreEntryModal.tsx
 * VERSION: V07.35
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  notifyScoreConfirmation,
  DEFAULT_VERIFICATION_SETTINGS,
} from '../../services/firebase';
// V07.04: DUPR-Compliant Scoring
import {
  proposeScore,
  signScore,
  finaliseResult,
} from '../../services/firebase/duprScoring';
import { rebuildAllStandingsById } from '../../services/firebase';
import type { LeagueMatch, GameScore, ScoreVerificationSettings } from '../../types';
import {
  ScoreVerificationBadge,
  DisputeScoreModal,
} from './verification';

// ============================================
// TYPES
// ============================================

interface LeagueScoreEntryModalProps {
  leagueId: string;
  leagueName?: string;
  match: LeagueMatch;
  bestOf: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  verificationSettings?: ScoreVerificationSettings;
  isOrganizer?: boolean;
  isDuprLeague?: boolean;  // V07.35: Only apply DUPR compliance rules for DUPR leagues
  onClose: () => void;
  onSuccess: () => void;
}

interface GameInput {
  scoreA: string;
  scoreB: string;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueScoreEntryModal: React.FC<LeagueScoreEntryModalProps> = ({
  leagueId,
  leagueName,
  match,
  bestOf,
  pointsPerGame,
  winBy,
  verificationSettings = DEFAULT_VERIFICATION_SETTINGS,
  isOrganizer = false,
  isDuprLeague = false,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();

  const [games, setGames] = useState<GameInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  // V07.35: Edit mode for organizers to modify finalized scores
  const [isEditMode, setIsEditMode] = useState(false);


  // V07.26: Box league support - get names and IDs from sideA/sideB if memberAName/memberBName are empty
  const sideA = (match as any).sideA;
  const sideB = (match as any).sideB;
  const teamAName = match.memberAName || sideA?.name || 'Team A';
  const teamBName = match.memberBName || sideB?.name || 'Team B';
  const teamAId = match.memberAId || sideA?.id || match.userAId;
  const teamBId = match.memberBId || sideB?.id || match.userBId;

  // V07.26: For box leagues, check if user is in sideA.playerIds or sideB.playerIds
  const isInSideA = sideA?.playerIds?.includes(currentUser?.uid);
  const isInSideB = sideB?.playerIds?.includes(currentUser?.uid);

  // Determine user's role in this match
  // V07.32: Check both primary players AND partners for doubles matches
  // V07.26: Also check sideA/sideB.playerIds for box leagues
  const isPlayerA = currentUser?.uid === match.userAId || currentUser?.uid === match.partnerAId || isInSideA;
  const isPlayerB = currentUser?.uid === match.userBId || currentUser?.uid === match.partnerBId || isInSideB;
  const isParticipant = isPlayerA || isPlayerB;

  // V07.35: DUPR compliance rules only apply to DUPR leagues
  // For non-DUPR leagues, organizer-as-participant CAN propose and finalize their own matches
  // For DUPR leagues, when organizer is a participant:
  // - They cannot finalize their own match (effectiveIsOrganizer = false)
  // - They cannot propose their own match score (only opponent can propose)
  const effectiveIsOrganizer = isDuprLeague
    ? (isOrganizer && !isParticipant)  // DUPR: organizer can't finalize own match
    : isOrganizer;                      // Non-DUPR: organizer can always finalize
  const isOrganizerParticipant = isDuprLeague && isOrganizer && isParticipant;

  // Get all player IDs
  const matchPlayerIds = [match.userAId, match.userBId];
  if (match.partnerAId) matchPlayerIds.push(match.partnerAId);
  if (match.partnerBId) matchPlayerIds.push(match.partnerBId);

  // V07.04: Check verification status using scoreState (DUPR-compliant) with legacy fallback
  const verification = match.verification;
  const hasScore = match.status === 'completed' || match.status === 'pending_confirmation' ||
    (match.scores?.length ?? 0) > 0 || (match.scoreProposal?.scores?.length ?? 0) > 0;

  // V07.04: Map scoreState to verification status for UI
  const verificationStatus = match.scoreState === 'proposed' ? 'pending' :
    match.scoreState === 'signed' ? 'confirmed' :
    match.scoreState === 'disputed' ? 'disputed' :
    match.scoreState === 'official' || match.scoreState === 'submittedToDupr' ? 'final' :
    // Legacy fallback
    verification?.verificationStatus ||
    (match.status === 'pending_confirmation' ? 'pending' :
     match.status === 'completed' ? 'final' : undefined);

  const isPending = verificationStatus === 'pending' || verificationStatus === 'confirmed';
  const isSigned = match.scoreState === 'signed'; // V07.04: Awaiting organiser
  const isFinal = verificationStatus === 'final';
  const isDisputed = verificationStatus === 'disputed' || match.scoreState === 'disputed';

  // V07.04: Check if user can sign to acknowledge
  // User must be opponent of the proposer (not the one who proposed)
  const proposerId = match.scoreProposal?.enteredByUserId || match.submittedByUserId;
  const userCanConfirm = isParticipant &&
    hasScore &&
    (match.scoreState === 'proposed' || isPending) && // V07.04: Check scoreState
    !isSigned && // Already signed
    proposerId !== currentUser?.uid && // Not the proposer
    !(verification?.confirmations || []).includes(currentUser?.uid || '');

  // Check if user can dispute
  const userCanDispute = isParticipant &&
    hasScore &&
    !isFinal &&
    !isDisputed &&
    verificationSettings.allowDisputes;

  // Check if user can submit scores
  // V07.35: For DUPR leagues, organizer-as-participant CANNOT propose their own match
  // For non-DUPR leagues, anyone can propose (isOrganizerParticipant will be false)
  const canSubmitScore = (isParticipant && !isOrganizerParticipant) || effectiveIsOrganizer;

  // Initialize games from existing scores or empty
  useEffect(() => {
    if (match.scores && match.scores.length > 0) {
      setGames(match.scores.map(s => ({
        scoreA: (s.scoreA ?? 0).toString(),
        scoreB: (s.scoreB ?? 0).toString(),
      })));
    } else {
      // Initialize with one empty game
      setGames([{ scoreA: '', scoreB: '' }]);
    }
  }, [match.scores]);

  // ============================================
  // VALIDATION
  // ============================================

  const validateGame = (scoreA: number, scoreB: number): { valid: boolean; error?: string } => {
    if (isNaN(scoreA) || isNaN(scoreB)) {
      return { valid: false, error: 'Please enter valid scores' };
    }

    if (scoreA < 0 || scoreB < 0) {
      return { valid: false, error: 'Scores cannot be negative' };
    }

    const maxScore = Math.max(scoreA, scoreB);
    const minScore = Math.min(scoreA, scoreB);
    const target = pointsPerGame;

    // Check for tie
    if (scoreA === scoreB) {
      return { valid: false, error: 'Games cannot end in a tie' };
    }

    // Check if someone won (reached target)
    if (maxScore < target) {
      return { valid: false, error: `Game must be won by reaching ${target} points` };
    }

    // Validate win-by requirement
    if (winBy === 2) {
      // Must win by 2 points
      if (maxScore - minScore < 2) {
        return { valid: false, error: `Must win by ${winBy} points` };
      }

      // If winner scored exactly the target, loser must have scored at most target-2
      // e.g., 11-9 is valid, 11-10 is not (would need to go to 12-10)
      if (maxScore === target && minScore > target - 2) {
        return { valid: false, error: `Must win by ${winBy} points (score would be ${target}-${target - 2} or less)` };
      }

      // If winner scored more than target, it must be a deuce situation
      // e.g., 12-10, 13-11, 14-12 are valid (deuce scenarios)
      // but 15-9 is invalid (game would have ended at 11-9)
      if (maxScore > target) {
        // In deuce, winner is exactly 2 points ahead and loser must have at least target-1
        // Valid: 12-10, 13-11, 14-12... (loser >= target-1, diff = 2)
        // Invalid: 15-9 (loser < target-1)
        if (minScore < target - 1) {
          return { valid: false, error: `Invalid score - game would have ended at ${target}-${minScore}` };
        }
        // In extended play, winner must be exactly 2 ahead
        if (maxScore - minScore !== 2) {
          return { valid: false, error: `In deuce, winner must be exactly 2 points ahead` };
        }
      }
    } else {
      // Win by 1: winner just needs to reach target
      if (maxScore > target) {
        return { valid: false, error: `Invalid score - game ends at ${target} points (win by 1)` };
      }
    }

    return { valid: true };
  };

  const calculateWinner = (): { winnerId: string | null; gamesA: number; gamesB: number } => {
    let gamesA = 0;
    let gamesB = 0;

    for (const game of games) {
      const scoreA = parseInt(game.scoreA) || 0;
      const scoreB = parseInt(game.scoreB) || 0;
      if (scoreA > scoreB) gamesA++;
      if (scoreB > scoreA) gamesB++;
    }

    const winThreshold = Math.ceil(bestOf / 2);

    // V07.26: Use resolved teamAId/teamBId for box league support
    if (gamesA >= winThreshold) {
      return { winnerId: teamAId, gamesA, gamesB };
    }
    if (gamesB >= winThreshold) {
      return { winnerId: teamBId, gamesA, gamesB };
    }

    return { winnerId: null, gamesA, gamesB };
  };

  const validateAllGames = (): { valid: boolean; error?: string } => {
    const filledGames = games.filter(g => g.scoreA !== '' || g.scoreB !== '');
    
    if (filledGames.length === 0) {
      return { valid: false, error: 'Please enter at least one game score' };
    }

    for (let i = 0; i < filledGames.length; i++) {
      const scoreA = parseInt(filledGames[i].scoreA);
      const scoreB = parseInt(filledGames[i].scoreB);
      const validation = validateGame(scoreA, scoreB);
      
      if (!validation.valid) {
        return { valid: false, error: `Game ${i + 1}: ${validation.error}` };
      }
    }

    const { winnerId, gamesA, gamesB } = calculateWinner();
    
    if (!winnerId) {
      return { valid: false, error: `Match not complete. Current: ${gamesA}-${gamesB}. Need ${Math.ceil(bestOf / 2)} games to win.` };
    }

    return { valid: true };
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleGameChange = (index: number, field: 'scoreA' | 'scoreB', value: string) => {
    // Only allow numbers
    if (value !== '' && !/^\d+$/.test(value)) return;

    const newGames = [...games];
    newGames[index] = { ...newGames[index], [field]: value };
    setGames(newGames);
    setError(null);
  };

  // V07.03: Quick score button handler - sets winner to clicked score, loser to score - 2
  const handleQuickScore = (index: number, score: number, winner: 'A' | 'B') => {
    const loserScore = Math.max(0, score - 2);
    const newGames = [...games];
    if (winner === 'A') {
      newGames[index] = { scoreA: String(score), scoreB: String(loserScore) };
    } else {
      newGames[index] = { scoreA: String(loserScore), scoreB: String(score) };
    }
    setGames(newGames);
    setError(null);
  };

  // V07.03: Progressive reveal - auto-add next game when current is valid
  useEffect(() => {
    if (bestOf === 1 || hasScore) return;
    if (games.length >= bestOf) return;

    const lastGame = games[games.length - 1];
    if (!lastGame || lastGame.scoreA === '' || lastGame.scoreB === '') return;

    const scoreA = parseInt(lastGame.scoreA) || 0;
    const scoreB = parseInt(lastGame.scoreB) || 0;
    const validation = validateGame(scoreA, scoreB);

    // If last game is valid and match not decided yet
    if (validation.valid) {
      // Calculate win threshold inline to avoid dependency issues
      const localWinThreshold = Math.ceil(bestOf / 2);
      let gamesA = 0, gamesB = 0;
      games.forEach(g => {
        const sa = parseInt(g.scoreA) || 0;
        const sb = parseInt(g.scoreB) || 0;
        if (sa > sb) gamesA++;
        else if (sb > sa) gamesB++;
      });

      if (gamesA < localWinThreshold && gamesB < localWinThreshold) {
        // Auto-add next game
        setGames(prev => [...prev, { scoreA: '', scoreB: '' }]);
      }
    }
  }, [games, bestOf, hasScore, validateGame]);

  const removeGame = (index: number) => {
    if (games.length > 1) {
      setGames(games.filter((_, i) => i !== index));
    }
  };

  // V07.04: DUPR-Compliant submit handler
  const handleSubmit = async () => {
    if (!currentUser) return;

    const validation = validateAllGames();
    if (!validation.valid) {
      setError(validation.error || 'Invalid scores');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert to GameScore format
      const scores: GameScore[] = games
        .filter(g => g.scoreA !== '' && g.scoreB !== '')
        .map((g, i) => ({
          gameNumber: i + 1,
          scoreA: parseInt(g.scoreA),
          scoreB: parseInt(g.scoreB),
        }));

      const { winnerId, gamesA, gamesB } = calculateWinner();

      // V07.04: Use DUPR-compliant scoring
      // V07.32: Use effectiveIsOrganizer to prevent organizer-as-participant from finalizing their own match
      if (effectiveIsOrganizer) {
        // Organizer (not participating in this match) directly finalizes the result
        await finaliseResult(
          'league',
          leagueId,
          match.id,
          scores,
          winnerId!,
          currentUser.uid,
          true  // duprEligible
        );
      } else {
        // Player proposes score, awaiting opponent acknowledgement
        await proposeScore(
          'league',
          leagueId,
          match.id,
          scores,
          winnerId!,
          currentUser.uid
        );

        // Send notification to opponent to confirm the score
        const submitterName = isPlayerA ? teamAName : teamBName;
        const opponentUserId = isPlayerA ? match.userBId : match.userAId;
        const scoreDisplay = `${gamesA}-${gamesB}`;

        // Collect all opponent user IDs (for doubles, include partner)
        const opponentUserIds = [opponentUserId];
        if (isPlayerA && match.partnerBId) {
          opponentUserIds.push(match.partnerBId);
        } else if (isPlayerB && match.partnerAId) {
          opponentUserIds.push(match.partnerAId);
        }

        // Send notification (fire and forget - don't block on this)
        notifyScoreConfirmation(
          opponentUserIds,
          leagueId,
          match.id,
          submitterName,
          scoreDisplay,
          leagueName
        ).catch(err => {
          console.warn('Failed to send score confirmation notification:', err);
        });
      }

      onSuccess();
    } catch (e: any) {
      console.error('Failed to submit score:', e);
      setError(e.message || 'Failed to submit score');
    } finally {
      setLoading(false);
    }
  };

  // V07.04: Handle sign to acknowledge using DUPR-compliant scoring
  const handleConfirm = async () => {
    if (!currentUser) return;

    setConfirming(true);
    setError(null);

    try {
      // V07.04: Use signScore - sets scoreProposal.status to 'signed'
      // and marks the proposal as locked (awaiting organiser finalization)
      await signScore(
        'league',
        leagueId,
        match.id,
        currentUser.uid
      );

      onSuccess();
      // After signing, show "Awaiting organiser approval" state
      // Don't close - user may want to see the updated status
    } catch (e: any) {
      console.error('Failed to sign score:', e);
      setError(e.message || 'Failed to sign score');
    } finally {
      setConfirming(false);
    }
  };

  // V07.35: Handle organizer finalization of a signed match
  const handleOrganizerFinalize = async () => {
    if (!currentUser) return;

    setLoading(true);
    setError(null);

    try {
      // Use existing scores from the match (already signed by players)
      const scores = match.scores || match.scoreProposal?.scores || [];

      if (scores.length === 0) {
        setError('No scores to finalize');
        return;
      }

      // Calculate winner from scores
      let gamesA = 0, gamesB = 0;
      for (const score of scores) {
        if ((score.scoreA ?? 0) > (score.scoreB ?? 0)) gamesA++;
        else if ((score.scoreB ?? 0) > (score.scoreA ?? 0)) gamesB++;
      }

      const winnerId = gamesA > gamesB ? teamAId : teamBId;

      // Finalize the result
      await finaliseResult(
        'league',
        leagueId,
        match.id,
        scores,
        winnerId,
        currentUser.uid,
        isDuprLeague  // duprEligible based on league type
      );

      onSuccess();
    } catch (e: any) {
      console.error('Failed to finalize score:', e);
      setError(e.message || 'Failed to finalize score');
    } finally {
      setLoading(false);
    }
  };

  // V07.35: Handle saving edited scores (for organizer corrections)
  const handleSaveEditedScore = async () => {
    if (!currentUser) return;

    // Validate all games
    const validation = validateAllGames();
    if (!validation.valid) {
      setError(validation.error || 'Invalid scores');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert games to GameScore format
      const scores: GameScore[] = games.map((g, idx) => ({
        gameNumber: idx + 1,
        scoreA: parseInt(g.scoreA) || 0,
        scoreB: parseInt(g.scoreB) || 0,
      }));

      // Calculate winner from updated scores
      let gamesWonA = 0, gamesWonB = 0;
      for (const score of scores) {
        if (score.scoreA > score.scoreB) gamesWonA++;
        else if (score.scoreB > score.scoreA) gamesWonB++;
      }

      const winnerId = gamesWonA > gamesWonB ? teamAId : teamBId;

      // Finalize the updated result
      await finaliseResult(
        'league',
        leagueId,
        match.id,
        scores,
        winnerId,
        currentUser.uid,
        isDuprLeague
      );

      // Recalculate standings
      try {
        await rebuildAllStandingsById(leagueId);
      } catch (standingsError) {
        console.error('Failed to recalculate standings:', standingsError);
      }

      setIsEditMode(false);
      onSuccess();
    } catch (e: any) {
      console.error('Failed to save edited score:', e);
      setError(e.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  const { gamesA, gamesB } = calculateWinner();
  const winThreshold = Math.ceil(bestOf / 2);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full max-w-md rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                {/* V07.04: DUPR-compliant header titles */}
                {/* V07.35: Show "Edit Score" when in edit mode */}
                {isEditMode ? 'Edit Score' :
                  isSigned ? 'Awaiting Organiser' :
                  hasScore && userCanConfirm ? 'Sign to Acknowledge' :
                  hasScore && !isFinal ? 'Score Proposed' :
                  hasScore ? 'Match Score' :
                  effectiveIsOrganizer ? 'Finalise Score' : 'Propose Score'}
              </h2>
              {/* Verification Badge */}
              {verificationStatus && (
                <div className="mt-1">
                  <ScoreVerificationBadge
                    status={verificationStatus}
                    confirmationCount={verification?.confirmations?.length || 0}
                    requiredConfirmations={verification?.requiredConfirmations || 1}
                    showCount={isPending}
                  />
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Match Info */}
        <div className="px-6 py-4 bg-gray-900/50 border-b border-gray-700">
          <div className="flex items-center justify-between text-center">
            <div className="flex-1">
              <div className={`font-semibold ${isPlayerA ? 'text-blue-400' : 'text-white'}`}>
                {teamAName}
              </div>
              {isPlayerA && <div className="text-xs text-blue-400">(You)</div>}
            </div>
            <div className="px-4 text-gray-500 text-sm">vs</div>
            <div className="flex-1">
              <div className={`font-semibold ${isPlayerB ? 'text-blue-400' : 'text-white'}`}>
                {teamBName}
              </div>
              {isPlayerB && <div className="text-xs text-blue-400">(You)</div>}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* V07.32: DUPR compliance - organizer-as-participant cannot propose */}
          {isOrganizerParticipant && !hasScore && (
            <div className="bg-amber-900/30 border border-amber-600/50 text-amber-200 px-4 py-3 rounded-lg text-sm">
              <div className="font-semibold mb-1">DUPR Compliance</div>
              <div className="text-amber-300/80">
                As an organizer playing in this match, you cannot propose the score.
                Your opponent must propose the score first, then you can confirm it.
              </div>
            </div>
          )}

          {/* Score Entry */}
          {!showDisputeModal && (
            <>
              <div className="text-sm text-gray-400 text-center mb-2">
                Best of {bestOf} • First to {winThreshold} games • Games to {pointsPerGame}
              </div>

              {/* Game Scores - V07.03: Added quick score buttons */}
              <div className="space-y-4">
                {games.map((game, index) => {
                  const hasGameScore = game.scoreA !== '' || game.scoreB !== '';
                  return (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-xs text-gray-500 font-medium">Game {index + 1}</div>
                        <div className="flex-1 flex items-center gap-4 justify-center">
                          {/* V07.34: +/- Stepper for Score A */}
                          {/* V07.35: Allow editing when isEditMode is true */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const current = parseInt(game.scoreA) || 0;
                                if (current > 0) handleGameChange(index, 'scoreA', String(current - 1));
                              }}
                              disabled={(hasScore && !isEditMode) || (parseInt(game.scoreA) || 0) <= 0}
                              className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                            >
                              −
                            </button>
                            <div className="w-12 h-11 bg-gray-900 border border-gray-700 text-white text-center flex items-center justify-center rounded-lg font-bold text-xl">
                              {game.scoreA || '0'}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const current = parseInt(game.scoreA) || 0;
                                handleGameChange(index, 'scoreA', String(current + 1));
                              }}
                              disabled={hasScore && !isEditMode}
                              className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-lime-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-gray-500 font-bold text-lg">-</span>
                          {/* V07.34: +/- Stepper for Score B */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const current = parseInt(game.scoreB) || 0;
                                if (current > 0) handleGameChange(index, 'scoreB', String(current - 1));
                              }}
                              disabled={(hasScore && !isEditMode) || (parseInt(game.scoreB) || 0) <= 0}
                              className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                            >
                              −
                            </button>
                            <div className="w-12 h-11 bg-gray-900 border border-gray-700 text-white text-center flex items-center justify-center rounded-lg font-bold text-xl">
                              {game.scoreB || '0'}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const current = parseInt(game.scoreB) || 0;
                                handleGameChange(index, 'scoreB', String(current + 1));
                              }}
                              disabled={hasScore && !isEditMode}
                              className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-lime-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {games.length > 1 && (!hasScore || isEditMode) && (
                          <button
                            onClick={() => removeGame(index)}
                            className="text-gray-500 hover:text-red-400"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* V07.03: Quick score buttons */}
                      {!hasScore && !hasGameScore && (
                        <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700/30">
                          <span className="text-xs text-gray-500 mr-1">{teamAName?.split(' ')[0]}:</span>
                          {[11, 15, 21].map(score => (
                            <button
                              key={`A-${score}`}
                              type="button"
                              onClick={() => handleQuickScore(index, score, 'A')}
                              className="px-2 py-1 text-xs bg-gray-700 hover:bg-lime-600 hover:text-gray-900 rounded transition-colors"
                            >
                              {score}
                            </button>
                          ))}
                          <span className="mx-2 text-gray-600">|</span>
                          <span className="text-xs text-gray-500 mr-1">{teamBName?.split(' ')[0]}:</span>
                          {[11, 15, 21].map(score => (
                            <button
                              key={`B-${score}`}
                              type="button"
                              onClick={() => handleQuickScore(index, score, 'B')}
                              className="px-2 py-1 text-xs bg-gray-700 hover:bg-lime-600 hover:text-gray-900 rounded transition-colors"
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* V07.03: Progressive reveal - no manual Add Game button needed */}
              {/* Game is auto-added when previous game is valid */}

              {/* Current Score Summary */}
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-sm text-gray-400 mb-1">Match Score</div>
                {/* V07.26: Show actual game scores instead of just game wins */}
                <div className="text-xl font-bold space-x-3">
                  {games.filter(g => g.scoreA !== '' || g.scoreB !== '').map((game, idx) => (
                    <span key={idx} className="inline-block">
                      <span className={parseInt(game.scoreA) > parseInt(game.scoreB) ? 'text-green-400' : 'text-white'}>
                        {game.scoreA || '0'}
                      </span>
                      <span className="text-gray-500">-</span>
                      <span className={parseInt(game.scoreB) > parseInt(game.scoreA) ? 'text-green-400' : 'text-white'}>
                        {game.scoreB || '0'}
                      </span>
                      {idx < games.filter(g => g.scoreA !== '' || g.scoreB !== '').length - 1 && (
                        <span className="text-gray-600 ml-3">,</span>
                      )}
                    </span>
                  ))}
                </div>
                {/* Game win count for best of 3/5 */}
                {bestOf > 1 && (
                  <div className="text-sm text-gray-400 mt-1">
                    Games: {gamesA} - {gamesB}
                  </div>
                )}
                {gamesA >= winThreshold && (
                  <div className="text-sm text-green-400 mt-1">{teamAName} wins!</div>
                )}
                {gamesB >= winThreshold && (
                  <div className="text-sm text-green-400 mt-1">{teamBName} wins!</div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="bg-gray-900 px-6 py-4 border-t border-gray-700">
          {/* V07.04: Waiting for opponent to sign */}
          {hasScore && match.scoreState === 'proposed' && !userCanConfirm && proposerId === currentUser?.uid && (
            <div className="text-sm text-yellow-400 text-center mb-3">
              ⏳ Waiting for opponent to sign and acknowledge...
            </div>
          )}

          {/* V07.04: Score signed - awaiting organiser approval */}
          {isSigned && (
            <div className="text-sm text-purple-400 text-center mb-3">
              ✓ Score acknowledged. Awaiting organiser approval.
            </div>
          )}

          {/* Disputed message */}
          {isDisputed && (
            <div className="text-sm text-red-400 text-center mb-3">
              ⚠️ This match is disputed and awaiting organizer review.
            </div>
          )}

          {/* V07.04: Sign prompt - DUPR-compliant wording */}
          {userCanConfirm && (
            <div className="text-sm text-yellow-400 text-center mb-3">
              ⚠️ Your opponent proposed this score. Please sign to acknowledge or dispute.
            </div>
          )}

          <div className="flex gap-3">
            {/* Cancel/Close button */}
            <button
              onClick={() => {
                if (isEditMode) {
                  setIsEditMode(false);
                  // Reset games to original scores
                  if (match.scores && match.scores.length > 0) {
                    setGames(match.scores.map(s => ({
                      scoreA: (s.scoreA ?? 0).toString(),
                      scoreB: (s.scoreB ?? 0).toString(),
                    })));
                  }
                } else {
                  onClose();
                }
              }}
              disabled={loading || confirming}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-50"
            >
              {isEditMode ? 'Cancel Edit' : (isFinal || isDisputed ? 'Close' : 'Cancel')}
            </button>

            {/* Dispute button - only show when user can dispute */}
            {userCanDispute && !isFinal && !isEditMode && (
              <button
                onClick={() => setShowDisputeModal(true)}
                className="flex-1 py-2 bg-red-600/20 border border-red-600 text-red-400 rounded-lg font-semibold hover:bg-red-600/30"
              >
                Dispute
              </button>
            )}

            {/* V07.04: Sign to Acknowledge button - DUPR-compliant wording */}
            {userCanConfirm && !isEditMode && (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {confirming ? 'Signing...' : 'Sign to Acknowledge'}
              </button>
            )}

            {/* V07.35: Organizer Finalize button - for signed matches awaiting organizer approval */}
            {hasScore && isSigned && effectiveIsOrganizer && !isFinal && !isEditMode && (
              <button
                onClick={handleOrganizerFinalize}
                disabled={loading}
                className="flex-1 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {loading ? 'Finalizing...' : 'Finalize Score'}
              </button>
            )}

            {/* V07.35: Edit Score button - for organizers to correct finalized scores */}
            {isFinal && effectiveIsOrganizer && !isEditMode && (
              <button
                onClick={() => setIsEditMode(true)}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold"
              >
                Edit Score
              </button>
            )}

            {/* V07.35: Save Changes button - when editing */}
            {isEditMode && (
              <button
                onClick={handleSaveEditedScore}
                disabled={loading}
                className="flex-1 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            )}

            {/* V07.04: Propose/Finalise button - DUPR-compliant wording */}
            {!hasScore && !isEditMode && (
              <button
                onClick={handleSubmit}
                disabled={loading || !canSubmitScore}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {loading ? (effectiveIsOrganizer ? 'Finalising...' : 'Proposing...') :
                  effectiveIsOrganizer ? 'Finalise Official Score' : 'Propose Score'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dispute Modal */}
      <DisputeScoreModal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        eventType="league"
        eventId={leagueId}
        matchId={match.id}
        userId={currentUser?.uid || ''}
        matchDescription={`${teamAName} vs ${teamBName}`}
        currentScore={match.scores?.length
          ? match.scores.map(s => `${s.scoreA}-${s.scoreB}`).join(', ')
          : undefined
        }
        onDisputed={() => {
          onSuccess();
          setShowDisputeModal(false);
        }}
      />

    </div>
  );
};

export default LeagueScoreEntryModal;