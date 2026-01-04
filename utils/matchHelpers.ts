/**
 * Match Helper Functions for DUPR-Compliant Scoring
 *
 * These helpers read from officialResult (or legacy fields for migrated matches).
 * Standings/brackets MUST use these helpers to ensure only official results are counted.
 *
 * @version V07.04
 * @file utils/matchHelpers.ts
 */

import type { Match, GameScore } from '../types';

// ============================================
// OFFICIAL RESULT HELPERS
// ============================================

/**
 * Get match winner - ONLY from officialResult
 * Returns undefined if no officialResult (match not finalized)
 * Legacy fallback ONLY for matches with migratedFromLegacy === true
 */
export function getMatchWinner(match: Match): string | undefined {
  // Prefer officialResult
  if (match.officialResult?.winnerId) {
    return match.officialResult.winnerId;
  }

  // Legacy fallback ONLY for migrated matches
  if (match.migratedFromLegacy && match.winnerId) {
    return match.winnerId;
  }

  // Not finalized = no winner
  return undefined;
}

/**
 * Get match winner name - ONLY from officialResult
 */
export function getMatchWinnerName(match: Match): string | undefined {
  if (match.officialResult?.winnerName) {
    return match.officialResult.winnerName;
  }

  // Legacy fallback for migrated matches
  if (match.migratedFromLegacy && match.winnerName) {
    return match.winnerName;
  }

  return undefined;
}

/**
 * Get match scores - ONLY from officialResult
 */
export function getMatchScores(match: Match): GameScore[] {
  // Prefer officialResult
  if (match.officialResult?.scores && match.officialResult.scores.length > 0) {
    return match.officialResult.scores;
  }

  // Legacy fallback ONLY for migrated matches
  if (match.migratedFromLegacy && match.scores?.length) {
    return match.scores;
  }

  // Not finalized = no scores
  return [];
}

/**
 * Check if match counts for standings
 * Only matches with officialResult (or migrated legacy) count
 */
export function matchCountsForStandings(match: Match): boolean {
  // Has official result
  if (match.officialResult) {
    return true;
  }

  // Migrated legacy match with winner
  if (match.migratedFromLegacy && match.winnerId) {
    return true;
  }

  return false;
}

/**
 * Check if match is officially completed
 * STRICTER than just checking status === 'completed'
 */
export function isMatchOfficiallyCompleted(match: Match): boolean {
  // Must have officialResult or be a migrated legacy match
  if (!matchCountsForStandings(match)) {
    return false;
  }

  // Must have a winner
  const winnerId = getMatchWinner(match);
  return !!winnerId;
}

// ============================================
// SCORE STATE HELPERS
// ============================================

/**
 * Check if match has a score proposal
 */
export function hasScoreProposal(match: Match): boolean {
  return !!match.scoreProposal;
}

/**
 * Check if score proposal is signed (acknowledged by opponent)
 */
export function isProposalSigned(match: Match): boolean {
  return match.scoreProposal?.status === 'signed';
}

/**
 * Check if score proposal is disputed
 */
export function isProposalDisputed(match: Match): boolean {
  return match.scoreProposal?.status === 'disputed';
}

/**
 * Check if score proposal is locked (signed or disputed)
 */
export function isProposalLocked(match: Match): boolean {
  return match.scoreProposal?.locked === true;
}

/**
 * Check if match score is locked (organizer finalized)
 */
export function isScoreLocked(match: Match): boolean {
  return match.scoreLocked === true;
}

/**
 * Get score state label for UI display
 */
export function getScoreStateLabel(match: Match): string {
  switch (match.scoreState) {
    case 'none':
      return 'No score';
    case 'proposed':
      return 'Score proposed';
    case 'signed':
      return 'Awaiting organiser approval';
    case 'disputed':
      return 'Score disputed';
    case 'official':
      return 'Official result';
    case 'submittedToDupr':
      return 'Submitted to DUPR';
    default:
      return 'Unknown';
  }
}

// ============================================
// PROPOSAL VS OFFICIAL DISPLAY
// ============================================

/**
 * Get scores to display in UI (proposal or official)
 * For display purposes, shows proposal if no official yet
 */
export function getDisplayScores(match: Match): GameScore[] {
  // Show official if exists
  if (match.officialResult?.scores) {
    return match.officialResult.scores;
  }

  // Show proposal scores if exists
  if (match.scoreProposal?.scores) {
    return match.scoreProposal.scores;
  }

  // Fall back to legacy scores
  return match.scores || [];
}

/**
 * Check if display scores are official or just proposed
 */
export function areDisplayScoresOfficial(match: Match): boolean {
  return !!match.officialResult;
}

// ============================================
// DUPR HELPERS
// ============================================

/**
 * Check if match is eligible for DUPR submission
 */
export function isDuprEligible(match: Match): boolean {
  // Must have official result
  if (!match.officialResult) {
    return false;
  }

  // Must be completed with official scoreState
  if (match.status !== 'completed' || match.scoreState !== 'official') {
    return false;
  }

  // Check dupr.eligible flag if set
  if (match.dupr?.eligible === false) {
    return false;
  }

  return true;
}

/**
 * Check if match can have DUPR submission requested
 * (organizer only - checked separately)
 */
export function canRequestDuprSubmission(match: Match): boolean {
  return isDuprEligible(match) && match.dupr?.submitted !== true;
}

/**
 * Check if match has been submitted to DUPR
 */
export function isSubmittedToDupr(match: Match): boolean {
  return match.dupr?.submitted === true || match.scoreState === 'submittedToDupr';
}

/**
 * Check if DUPR submission needs correction
 */
export function needsDuprCorrection(match: Match): boolean {
  return match.dupr?.needsCorrection === true && match.dupr?.correctionSubmitted !== true;
}

// ============================================
// STANDINGS CALCULATION HELPERS
// ============================================

/**
 * Calculate total points for a side from official scores
 */
export function calculateTotalPointsFor(match: Match, side: 'sideA' | 'sideB'): number {
  const scores = getMatchScores(match);
  if (side === 'sideA') {
    return scores.reduce((sum, game) => sum + (game.scoreA || 0), 0);
  }
  return scores.reduce((sum, game) => sum + (game.scoreB || 0), 0);
}

/**
 * Calculate total points against for a side from official scores
 */
export function calculateTotalPointsAgainst(match: Match, side: 'sideA' | 'sideB'): number {
  return calculateTotalPointsFor(match, side === 'sideA' ? 'sideB' : 'sideA');
}

/**
 * Calculate games won for a side from official scores
 */
export function calculateGamesWon(match: Match, side: 'sideA' | 'sideB'): number {
  const scores = getMatchScores(match);
  return scores.filter(game => {
    if (side === 'sideA') {
      return (game.scoreA || 0) > (game.scoreB || 0);
    }
    return (game.scoreB || 0) > (game.scoreA || 0);
  }).length;
}

/**
 * Format match score for display (e.g., "11-9, 7-11, 11-8")
 */
export function formatMatchScore(match: Match): string {
  const scores = getDisplayScores(match);
  if (scores.length === 0) return '';

  return scores
    .map(game => `${game.scoreA ?? 0}-${game.scoreB ?? 0}`)
    .join(', ');
}

// ============================================
// TEAM SNAPSHOT HELPERS
// ============================================

/**
 * Check if user is on Side A based on team snapshot
 */
export function isUserOnSideA(match: Match, userId: string): boolean {
  // Prefer team snapshot if available
  if (match.teamSnapshot?.sideAPlayerIds) {
    return match.teamSnapshot.sideAPlayerIds.includes(userId);
  }
  // Check sideA.playerIds (tournament format)
  if (match.sideA?.playerIds?.includes(userId)) {
    return true;
  }
  // Check league match fields (userAId, partnerAId)
  const leagueMatch = match as any;
  if (leagueMatch.userAId === userId || leagueMatch.partnerAId === userId) {
    return true;
  }
  return false;
}

/**
 * Check if user is on Side B based on team snapshot
 */
export function isUserOnSideB(match: Match, userId: string): boolean {
  // Prefer team snapshot if available
  if (match.teamSnapshot?.sideBPlayerIds) {
    return match.teamSnapshot.sideBPlayerIds.includes(userId);
  }
  // Check sideB.playerIds (tournament format)
  if (match.sideB?.playerIds?.includes(userId)) {
    return true;
  }
  // Check league match fields (userBId, partnerBId)
  const leagueMatch = match as any;
  if (leagueMatch.userBId === userId || leagueMatch.partnerBId === userId) {
    return true;
  }
  return false;
}

/**
 * Get which side a user is on based on team snapshot
 */
export function getUserSideFromSnapshot(
  match: Match,
  userId: string
): 'sideA' | 'sideB' | null {
  if (isUserOnSideA(match, userId)) return 'sideA';
  if (isUserOnSideB(match, userId)) return 'sideB';
  return null;
}

/**
 * Check if two users are on opposing teams
 */
export function areUsersOnOpposingTeams(
  match: Match,
  userId1: string,
  userId2: string
): boolean {
  const side1 = getUserSideFromSnapshot(match, userId1);
  const side2 = getUserSideFromSnapshot(match, userId2);

  if (!side1 || !side2) return false;
  return side1 !== side2;
}
