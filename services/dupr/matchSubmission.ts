/**
 * DUPR Match Submission Helper
 *
 * Converts app match data to DUPR's expected format for submission.
 *
 * FILE LOCATION: services/dupr/matchSubmission.ts
 * VERSION: V06.15
 */

import type { LeagueMatch, GameScore, UserProfile } from '../../types';
import type { DuprMatchSubmission } from './index';
import { submitMatchToDupr } from './index';

// ============================================
// TYPES
// ============================================

export interface MatchSubmissionResult {
  success: boolean;
  duprMatchId?: string;
  error?: string;
}

export interface SubmissionPlayers {
  userA: UserProfile;
  userB: UserProfile;
  partnerA?: UserProfile;
  partnerB?: UserProfile;
}

export interface SubmissionOptions {
  eventName?: string;
  clubId?: string;
  location?: string;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if a match is eligible for DUPR submission
 */
export function isDuprEligible(
  match: LeagueMatch,
  players: SubmissionPlayers
): { eligible: boolean; reason?: string } {
  // Check match is completed
  if (match.status !== 'completed') {
    return { eligible: false, reason: 'Match is not completed' };
  }

  // Check we have scores
  if (!match.scores || match.scores.length === 0) {
    return { eligible: false, reason: 'Match has no scores' };
  }

  // Check minimum score (DUPR requires at least one team to score 6+)
  const hasMinScore = match.scores.some(
    s => (s.scoreA ?? 0) >= 6 || (s.scoreB ?? 0) >= 6
  );
  if (!hasMinScore) {
    return { eligible: false, reason: 'At least one team must score 6 or more points' };
  }

  // Check player A has DUPR ID
  if (!players.userA?.duprId) {
    return { eligible: false, reason: `${players.userA?.displayName || 'Player A'} is not linked to DUPR` };
  }

  // Check player B has DUPR ID
  if (!players.userB?.duprId) {
    return { eligible: false, reason: `${players.userB?.displayName || 'Player B'} is not linked to DUPR` };
  }

  // For doubles, check partners have DUPR IDs
  // Determine doubles from partner presence since LeagueMatch.matchType is match classification (regular/challenge/etc)
  const isDoubles = !!(players.partnerA || players.partnerB) ||
    (match as any).leagueType === 'doubles' ||
    (match as any).leagueType === 'mixed_doubles';

  if (isDoubles) {
    if (players.partnerA && !players.partnerA.duprId) {
      return { eligible: false, reason: `${players.partnerA?.displayName || 'Partner A'} is not linked to DUPR` };
    }
    if (players.partnerB && !players.partnerB.duprId) {
      return { eligible: false, reason: `${players.partnerB?.displayName || 'Partner B'} is not linked to DUPR` };
    }
  }

  // Already submitted?
  if (match.duprSubmitted) {
    return { eligible: false, reason: 'Match already submitted to DUPR' };
  }

  return { eligible: true };
}

// ============================================
// DATA CONVERSION
// ============================================

/**
 * Build DUPR match submission payload from our match format
 */
export function buildDuprMatchSubmission(
  match: LeagueMatch,
  players: SubmissionPlayers,
  options: SubmissionOptions
): DuprMatchSubmission {
  // Determine if this is singles or doubles
  // Check partner presence since LeagueMatch.matchType is match classification (regular/challenge/etc)
  const isDoubles = !!(players.partnerA || players.partnerB) ||
    (match as any).leagueType === 'doubles' ||
    (match as any).leagueType === 'mixed_doubles';

  // Get completion timestamp
  const matchDate = match.completedAt
    ? new Date(match.completedAt).toISOString()
    : new Date().toISOString();

  // Build games array from scores
  const games = (match.scores || []).map((score: GameScore) => ({
    team1Score: score.scoreA ?? 0,
    team2Score: score.scoreB ?? 0,
  }));

  // Build team 1 (Player A side)
  const team1: DuprMatchSubmission['team1'] = {
    player1: { duprId: players.userA.duprId! },
    score: games.map(g => g.team1Score),
  };

  if (isDoubles && players.partnerA?.duprId) {
    team1.player2 = { duprId: players.partnerA.duprId };
  }

  // Build team 2 (Player B side)
  const team2: DuprMatchSubmission['team2'] = {
    player1: { duprId: players.userB.duprId! },
    score: games.map(g => g.team2Score),
  };

  if (isDoubles && players.partnerB?.duprId) {
    team2.player2 = { duprId: players.partnerB.duprId };
  }

  return {
    matchType: isDoubles ? 'DOUBLES' : 'SINGLES',
    matchDate,
    eventName: options.eventName,
    location: options.location,
    clubId: options.clubId,
    team1,
    team2,
    games,
  };
}

// ============================================
// SUBMISSION
// ============================================

/**
 * Submit a match to DUPR
 *
 * @param accessToken - User's DUPR access token
 * @param match - The match to submit
 * @param players - Player profiles with DUPR IDs
 * @param options - Event name, club ID, etc.
 * @returns Submission result with success/error
 */
export async function submitLeagueMatchToDupr(
  accessToken: string,
  match: LeagueMatch,
  players: SubmissionPlayers,
  options: SubmissionOptions
): Promise<MatchSubmissionResult> {
  try {
    // Validate eligibility first
    const eligibility = isDuprEligible(match, players);
    if (!eligibility.eligible) {
      return { success: false, error: eligibility.reason };
    }

    // Build submission payload
    const submission = buildDuprMatchSubmission(match, players, options);

    // Submit to DUPR
    const result = await submitMatchToDupr(accessToken, submission);

    return {
      success: true,
      duprMatchId: result.matchId,
    };
  } catch (error) {
    console.error('[DUPR] Match submission failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error submitting to DUPR',
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export default {
  isDuprEligible,
  buildDuprMatchSubmission,
  submitLeagueMatchToDupr,
};
