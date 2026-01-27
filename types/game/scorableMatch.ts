/**
 * ScorableMatch - Normalized match interface for score entry
 *
 * Use adapters to convert from specific match types:
 * - toScorableMatch(tournamentMatch, 'tournament', eventId)
 * - toScorableMatch(leagueMatch, 'league', eventId)
 * - toScorableMatch(meetupMatch, 'meetup', eventId)
 *
 * This provides a unified interface for EventScoreEntryModal and related
 * scoring components, avoiding the `Match | LeagueMatch` union type antipattern.
 *
 * @see docs/SCORING_ARCHITECTURE.md for full documentation
 * @version V07.53
 * @file types/game/scorableMatch.ts
 */

import type { EventType, MatchStatus } from './match';
import type {
  ScoreState,
  ScoreProposal,
  OfficialResult,
  MatchVerificationData,
  LeagueMatch,
  GameScore,
} from '../../types';
import type { Match } from './match';

// ============================================
// SCORABLE MATCH INTERFACE
// ============================================

/**
 * Normalized participant for scoring
 */
export interface ScorableParticipant {
  /** Unique identifier (team ID or member ID) */
  id: string;

  /** Display name (MUST be stored in match document) */
  name: string;

  /** User IDs of players (for permission checks) */
  playerIds: string[];
}

/**
 * ScorableMatch - The normalized match format for all scoring operations
 *
 * This is an adapter interface that normalizes tournament, league, and meetup
 * matches into a common format for the unified scoring modal.
 *
 * IMPORTANT: Display names should ALWAYS be stored in the match document.
 * If names are missing, we use placeholders but this indicates a data issue.
 */
export interface ScorableMatch {
  /** Match ID */
  id: string;

  /** Type of event (tournament, league, meetup) */
  eventType: EventType;

  /** Parent event ID */
  eventId: string;

  /** Event name for display */
  eventName?: string;

  // ==========================================
  // Participants (normalized)
  // ==========================================

  /** Side A participant */
  sideA: ScorableParticipant;

  /** Side B participant */
  sideB: ScorableParticipant;

  // ==========================================
  // Score State
  // ==========================================

  /** Current score state in workflow */
  scoreState?: ScoreState;

  /** Player-submitted score proposal */
  scoreProposal?: ScoreProposal;

  /** Organizer-finalized official result */
  officialResult?: OfficialResult;

  /** Current visible scores (may be proposal or official) */
  scores?: GameScore[];

  // ==========================================
  // Match Status
  // ==========================================

  /** Match status */
  status: MatchStatus | string;

  /** ID of winning side */
  winnerId?: string;

  // ==========================================
  // Locking & DUPR
  // ==========================================

  /** Score locked after organizer finalizes */
  scoreLocked?: boolean;

  /** Has been submitted to DUPR (immutable) */
  duprSubmitted?: boolean;

  // ==========================================
  // Verification (legacy)
  // ==========================================

  /** Legacy verification data */
  verification?: MatchVerificationData;

  // ==========================================
  // Denormalized Fields (for efficient queries)
  // ==========================================

  /**
   * All participant user IDs (for Firestore array-contains queries)
   * Computed from sideA.playerIds + sideB.playerIds
   */
  participantIds?: string[];
}

// ============================================
// ADAPTER FUNCTION
// ============================================

/**
 * Log warning when display name is missing from match document.
 * Returns undefined so we can chain fallbacks.
 *
 * If you see these warnings frequently, fix the match creation code
 * to store display names when the match is created.
 */
function warnMissingName(side: string, matchId: string): undefined {
  console.warn(
    `[toScorableMatch] Missing display name for ${side} in match ${matchId}. ` +
    `Preferred: Store display name when creating match.`
  );
  return undefined;
}

/**
 * Convert any match type to ScorableMatch for unified scoring UI
 *
 * @param match - Tournament Match, LeagueMatch, or any match with scoring fields
 * @param eventType - Type of event (tournament, league, meetup)
 * @param eventId - Parent event ID
 * @param eventName - Optional event name for display
 * @returns Normalized ScorableMatch
 *
 * @example
 * // From tournament
 * const scorable = toScorableMatch(tournamentMatch, 'tournament', tournamentId);
 *
 * // From league
 * const scorable = toScorableMatch(leagueMatch, 'league', leagueId);
 *
 * // From meetup
 * const scorable = toScorableMatch(meetupMatch, 'meetup', meetupId);
 */
export function toScorableMatch(
  match: Match | LeagueMatch,
  eventType: EventType,
  eventId: string,
  eventName?: string
): ScorableMatch {
  // ==========================================
  // Case 1: Tournament/Meetup Match (has sideA/sideB structure)
  // ==========================================
  if ('sideA' in match && match.sideA?.id) {
    const tournamentMatch = match as Match;

    const sideAPlayerIds = tournamentMatch.sideA?.playerIds || [];
    const sideBPlayerIds = tournamentMatch.sideB?.playerIds || [];

    return {
      id: tournamentMatch.id,
      eventType,
      eventId,
      eventName,
      sideA: {
        id: tournamentMatch.sideA.id,
        // Use stored name, fall back to ID if missing (log warning)
        name: tournamentMatch.sideA.name || warnMissingName('sideA', tournamentMatch.id) || tournamentMatch.sideA.id,
        playerIds: sideAPlayerIds,
      },
      sideB: {
        id: tournamentMatch.sideB.id,
        name: tournamentMatch.sideB.name || warnMissingName('sideB', tournamentMatch.id) || tournamentMatch.sideB.id,
        playerIds: sideBPlayerIds,
      },
      scoreState: tournamentMatch.scoreState,
      scoreProposal: tournamentMatch.scoreProposal,
      officialResult: tournamentMatch.officialResult,
      scores: tournamentMatch.scores,
      status: tournamentMatch.status,
      winnerId: tournamentMatch.winnerId,
      scoreLocked: tournamentMatch.scoreLocked,
      duprSubmitted: tournamentMatch.duprSubmitted || tournamentMatch.dupr?.submitted,
      verification: tournamentMatch.verification,
      participantIds: [...sideAPlayerIds, ...sideBPlayerIds],
    };
  }

  // ==========================================
  // Case 1b: Legacy Tournament Match (has teamAId/teamBId instead of sideA/sideB)
  // ==========================================
  const legacyTournamentMatch = match as any;
  if (legacyTournamentMatch.teamAId || legacyTournamentMatch.team1Id) {
    // Legacy tournament format - extract team IDs from old fields
    const teamAId = legacyTournamentMatch.teamAId || legacyTournamentMatch.team1Id;
    const teamBId = legacyTournamentMatch.teamBId || legacyTournamentMatch.team2Id;
    const teamAName = legacyTournamentMatch.team1Name || legacyTournamentMatch.teamAName || teamAId;
    const teamBName = legacyTournamentMatch.team2Name || legacyTournamentMatch.teamBName || teamBId;

    console.warn(
      `[toScorableMatch] Legacy tournament match ${legacyTournamentMatch.id} uses teamAId/teamBId. ` +
      `Preferred: Use sideA/sideB structure.`
    );

    return {
      id: legacyTournamentMatch.id,
      eventType,
      eventId,
      eventName,
      sideA: {
        id: teamAId,
        name: teamAName,
        playerIds: legacyTournamentMatch.sideA?.playerIds || [],
      },
      sideB: {
        id: teamBId,
        name: teamBName,
        playerIds: legacyTournamentMatch.sideB?.playerIds || [],
      },
      scoreState: legacyTournamentMatch.scoreState,
      scoreProposal: legacyTournamentMatch.scoreProposal,
      officialResult: legacyTournamentMatch.officialResult,
      scores: legacyTournamentMatch.scores,
      status: legacyTournamentMatch.status,
      winnerId: legacyTournamentMatch.winnerId || legacyTournamentMatch.winnerTeamId,
      scoreLocked: legacyTournamentMatch.scoreLocked,
      duprSubmitted: legacyTournamentMatch.duprSubmitted || legacyTournamentMatch.dupr?.submitted,
      verification: legacyTournamentMatch.verification,
      participantIds: [],
    };
  }

  // ==========================================
  // Case 2: League Match (legacy format with memberAId/memberBId)
  // ==========================================
  const leagueMatch = match as LeagueMatch;

  // If league match has sideA/sideB (V07.10+), prefer those
  if (leagueMatch.sideA?.id && leagueMatch.sideB?.id) {
    const sideAPlayerIds = leagueMatch.sideA.playerIds || [];
    const sideBPlayerIds = leagueMatch.sideB.playerIds || [];

    return {
      id: leagueMatch.id,
      eventType,
      eventId,
      eventName,
      sideA: {
        id: leagueMatch.sideA.id,
        name: leagueMatch.sideA.name || warnMissingName('sideA', leagueMatch.id) || leagueMatch.sideA.id,
        playerIds: sideAPlayerIds,
      },
      sideB: {
        id: leagueMatch.sideB.id,
        name: leagueMatch.sideB.name || warnMissingName('sideB', leagueMatch.id) || leagueMatch.sideB.id,
        playerIds: sideBPlayerIds,
      },
      scoreState: leagueMatch.scoreState,
      scoreProposal: leagueMatch.scoreProposal,
      officialResult: leagueMatch.officialResult,
      scores: leagueMatch.scores,
      status: leagueMatch.status,
      winnerId: leagueMatch.winnerMemberId || undefined,
      scoreLocked: leagueMatch.scoreLocked,
      duprSubmitted: leagueMatch.duprSubmitted,
      verification: leagueMatch.verification || undefined,
      participantIds: [...sideAPlayerIds, ...sideBPlayerIds],
    };
  }

  // Legacy league format: memberAId/memberBId, userAId/userBId
  // Construct playerIds from available fields

  // For leagues, prefer memberAName/memberBName (display names)
  // These should be populated when match is created from league members
  const sideAName = leagueMatch.memberAName ||
    warnMissingName('sideA', leagueMatch.id) ||
    leagueMatch.memberAId ||
    leagueMatch.userAId;

  const sideBName = leagueMatch.memberBName ||
    warnMissingName('sideB', leagueMatch.id) ||
    leagueMatch.memberBId ||
    leagueMatch.userBId;

  // Build playerIds from available user/partner fields
  const sideAPlayerIds = [leagueMatch.userAId, leagueMatch.partnerAId].filter(Boolean) as string[];
  const sideBPlayerIds = [leagueMatch.userBId, leagueMatch.partnerBId].filter(Boolean) as string[];

  return {
    id: leagueMatch.id,
    eventType,
    eventId,
    eventName,
    sideA: {
      id: leagueMatch.memberAId || leagueMatch.userAId,
      name: sideAName,
      playerIds: sideAPlayerIds,
    },
    sideB: {
      id: leagueMatch.memberBId || leagueMatch.userBId,
      name: sideBName,
      playerIds: sideBPlayerIds,
    },
    scoreState: leagueMatch.scoreState,
    scoreProposal: leagueMatch.scoreProposal,
    officialResult: leagueMatch.officialResult,
    scores: leagueMatch.scores,
    status: leagueMatch.status,
    winnerId: leagueMatch.winnerMemberId || undefined,
    scoreLocked: leagueMatch.scoreLocked,
    duprSubmitted: leagueMatch.duprSubmitted,
    verification: leagueMatch.verification || undefined,
    participantIds: [...sideAPlayerIds, ...sideBPlayerIds],
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user is a participant in the scorable match
 */
export function isScorableParticipant(match: ScorableMatch, userId: string): boolean {
  return (
    match.sideA.playerIds.includes(userId) ||
    match.sideB.playerIds.includes(userId)
  );
}

/**
 * Get which side the user is on
 */
export function getUserScorableSide(
  match: ScorableMatch,
  userId: string
): 'sideA' | 'sideB' | null {
  if (match.sideA.playerIds.includes(userId)) return 'sideA';
  if (match.sideB.playerIds.includes(userId)) return 'sideB';
  return null;
}

/**
 * Get the opponent's name for a given user
 */
export function getOpponentName(match: ScorableMatch, userId: string): string {
  const userSide = getUserScorableSide(match, userId);
  if (!userSide) return 'Unknown';
  return userSide === 'sideA' ? match.sideB.name : match.sideA.name;
}

/**
 * Format scores for display
 */
export function formatScorableScores(match: ScorableMatch): string {
  const scores = match.scoreProposal?.scores || match.officialResult?.scores || match.scores || [];
  if (scores.length === 0) return 'N/A';
  return scores.map(s => `${s.scoreA}-${s.scoreB}`).join(', ');
}
