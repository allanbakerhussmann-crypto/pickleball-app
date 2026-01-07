/**
 * DUPR Match Submission Helper
 *
 * Converts app match data to DUPR's expected format for submission.
 * Works for ALL event types: tournaments, leagues, and meetups.
 *
 * FILE LOCATION: services/dupr/matchSubmission.ts
 * VERSION: V07.23
 *
 * DUPR SUBMISSION PATTERN (for future reference):
 * ================================================
 * 1. Get match data with scores from any event type
 * 2. Gather all player profiles with DUPR IDs (via SSO login)
 * 3. Call isDuprEligible() to validate
 * 4. Call buildDuprMatchSubmission() to convert to DUPR format
 * 5. Call submitMatchToDupr() to send to DUPR API
 * 6. Update local match with duprSubmitted=true and duprMatchId
 *
 * REQUIRED FIELDS FOR DUPR:
 * - identifier: Unique ID (use format: {eventType}_{eventId}_{matchId})
 * - matchSource: 'PARTNER' (we are a partner integration)
 * - matchType: 'SINGLES' or 'DOUBLES'
 * - matchDate: ISO date string
 * - team1/team2: Player DUPR IDs
 * - games: Array of { team1Score, team2Score }
 *
 * VALIDATION RULES:
 * - At least one team must score 6+ points
 * - No tied games (every game must have a winner)
 * - All players must have DUPR IDs linked via SSO
 * - Match must be completed
 * - Match must not already be submitted
 */

import type { LeagueMatch, GameScore, UserProfile } from '../../types';
import type { DuprMatchSubmission, DuprMatchSource } from './index';
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
  /** Event type: tournament, league, or meetup */
  eventType: 'tournament' | 'league' | 'meetup';
  /** Event ID from Firestore */
  eventId: string;
  /** Match ID from Firestore - used to build unique identifier */
  matchId: string;
  /** Event name to display in DUPR */
  eventName?: string;
  /** DUPR Club ID if submitting as a club (optional) */
  clubId?: string;
  /** Location/venue name */
  location?: string;
}

/**
 * Generate unique identifier for DUPR match submission
 * Format: {eventType}_{eventId}_{matchId}
 * This prevents duplicate submissions
 */
export function generateDuprIdentifier(options: SubmissionOptions): string {
  return `${options.eventType}_${options.eventId}_${options.matchId}`;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if a match is eligible for DUPR submission
 *
 * Validates all DUPR requirements:
 * - Match completed with scores
 * - At least one team scored 6+ points
 * - No tied games
 * - All players have DUPR IDs
 * - Not already submitted
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

  // Check no tied games (DUPR requirement - every game must have a winner)
  const hasTiedGame = match.scores.some(
    s => (s.scoreA ?? 0) === (s.scoreB ?? 0)
  );
  if (hasTiedGame) {
    return { eligible: false, reason: 'All games must have a winner (no ties allowed)' };
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
 *
 * This function converts our internal match format to DUPR's expected format.
 * Works for tournaments, leagues, and meetups.
 *
 * IMPORTANT: The identifier field is REQUIRED and must be unique per match.
 * We use format: {eventType}_{eventId}_{matchId}
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

  // Generate unique identifier for this match
  const identifier = generateDuprIdentifier(options);

  // Determine match source:
  // - CLUB: If we have a DUPR club ID configured
  // - PARTNER: We are a partner integration (default)
  const matchSource: DuprMatchSource = options.clubId ? 'CLUB' : 'PARTNER';

  return {
    identifier,
    matchSource,
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
  generateDuprIdentifier,
  isDuprEligible,
  buildDuprMatchSubmission,
  submitLeagueMatchToDupr,
};
