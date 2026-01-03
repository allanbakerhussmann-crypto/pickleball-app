/**
 * Universal Match Types
 *
 * A single Match interface that works for ALL event types and formats.
 * Replaces the separate LeagueMatch, BoxLeagueMatch, Match, MeetupMatch types.
 *
 * FILE LOCATION: types/game/match.ts
 * VERSION: V06.00
 */

import type { GameSettings } from './gameSettings';
import type { CompetitionFormat } from '../formats/formatTypes';
import type { MatchVerificationData } from '../../types';

// ============================================
// GAME SCORE
// ============================================

/**
 * Score for a single game within a match
 */
export interface GameScore {
  /** Game number (1, 2, 3, etc.) */
  gameNumber: number;

  /** Score for Side A */
  scoreA: number;

  /** Score for Side B */
  scoreB: number;
}

// ============================================
// MATCH STATUS
// ============================================

/**
 * Universal match status
 */
export type MatchStatus =
  | 'scheduled'            // Match scheduled, not started
  | 'in_progress'          // Currently being played
  | 'pending_confirmation' // Score entered, awaiting confirmation
  | 'completed'            // Match finished and confirmed
  | 'disputed'             // Score disputed
  | 'cancelled'            // Match cancelled
  | 'forfeit'              // One side forfeited
  | 'bye';                 // Bye (no opponent)

// ============================================
// MATCH PARTICIPANT (SIDE)
// ============================================

/**
 * One side of a match (Side A or Side B)
 * Can be a single player, a doubles team, or a club team
 */
export interface MatchParticipant {
  /** Unique identifier (player ID, team ID, or member ID) */
  id: string;

  /** Display name */
  name: string;

  /** User IDs of players (1 for singles, 2 for doubles) */
  playerIds: string[];

  /** Player names for display */
  playerNames?: string[];

  /** DUPR IDs for submission */
  duprIds?: string[];

  /** DUPR rating used for seeding (singles or doubles based on playType) */
  duprRating?: number;

  /** Seed number (calculated from DUPR rating) */
  seed?: number;

  /** V06.33: Pool key from pool stage (for bracket tracking) */
  poolKey?: string;

  /** V06.33: Rank from pool stage (for bracket tracking) */
  poolRank?: number;
}

// ============================================
// EVENT TYPE
// ============================================

/**
 * Type of event this match belongs to
 */
export type EventType = 'tournament' | 'league' | 'meetup';

// ============================================
// UNIVERSAL MATCH INTERFACE
// ============================================

/**
 * Universal Match - works for ALL event types and formats
 *
 * This is the single source of truth for match data.
 * Replaces: LeagueMatch, BoxLeagueMatch, Match, MeetupMatch
 */
export interface Match {
  /** Unique match ID */
  id: string;

  // ==========================================
  // Event Context
  // ==========================================

  /** Type of event (tournament, league, meetup) */
  eventType: EventType;

  /** ID of the parent event */
  eventId: string;

  /** Competition format used */
  format: CompetitionFormat;

  /** Optional division within the event */
  divisionId?: string;

  // ==========================================
  // Game Settings
  // ==========================================

  /** How this match is scored (can inherit from event) */
  gameSettings: GameSettings;

  // ==========================================
  // Participants
  // ==========================================

  /** Side A (home/top seed) */
  sideA: MatchParticipant;

  /** Side B (away/lower seed) */
  sideB: MatchParticipant;

  // ==========================================
  // Scheduling
  // ==========================================

  /** Round number (for round robin, swiss, brackets) */
  roundNumber?: number;

  /** Week number (for leagues) */
  weekNumber?: number;

  /** Match number within round/week */
  matchNumber?: number;

  /** Scheduled date (timestamp) */
  scheduledDate?: number;

  /** Scheduled time (HH:MM format) */
  scheduledTime?: string;

  /** Court assignment */
  court?: string;

  /** Venue name */
  venue?: string;

  // ==========================================
  // Result
  // ==========================================

  /** Current status */
  status: MatchStatus;

  /** Game scores */
  scores: GameScore[];

  /** ID of winning side (sideA.id or sideB.id) */
  winnerId?: string;

  /** Winner name for display */
  winnerName?: string;

  // ==========================================
  // Score Entry
  // ==========================================

  /** User who submitted the score */
  submittedByUserId?: string;

  /** When score was submitted */
  submittedAt?: number;

  // ==========================================
  // Verification (V05.44 system)
  // ==========================================

  /** Score verification data */
  verification?: MatchVerificationData;

  // ==========================================
  // DUPR Integration
  // ==========================================

  /** Is this match eligible for DUPR submission? */
  duprEligible?: boolean;

  /** Has this match been submitted to DUPR? */
  duprSubmitted?: boolean;

  /** DUPR match ID after submission */
  duprMatchId?: string;

  /** When submitted to DUPR */
  duprSubmittedAt?: number;

  /** Error from DUPR submission */
  duprError?: string;

  // ==========================================
  // Format-Specific Fields
  // ==========================================

  /** Box number (for rotating/fixed doubles box) */
  boxNumber?: number;

  /** Match number within box */
  matchNumberInBox?: number;

  /** Bracket position (for elimination) */
  bracketPosition?: number;

  /** Bracket type - main bracket or plate/consolation bracket */
  bracketType?: 'main' | 'plate' | 'consolation';

  /** Next match ID (for brackets - winner advances here) */
  nextMatchId?: string;

  /** Which slot in next match (sideA or sideB) */
  nextMatchSlot?: 'sideA' | 'sideB';

  /** Pool group identifier (display name, e.g., "Pool A") */
  poolGroup?: string;

  /** Pool key (normalized identifier for queries/validation, e.g., "pool-a") */
  poolKey?: string;

  /** Stage of competition (pool, bracket, plate, finals) */
  stage?: 'pool' | 'bracket' | 'plate' | 'finals' | 'third_place';

  /** V07.02: Match type for premier court scheduling */
  matchType?: 'pool' | 'bracket' | 'semifinal' | 'final' | 'bronze' | 'plate_final' | 'plate_bronze';

  /** Is this a third place / bronze match? */
  isThirdPlace?: boolean;

  /** Challenge ID (for ladder format) */
  challengeId?: string;

  // ==========================================
  // Individual Player Results (for rotating doubles)
  // ==========================================

  /**
   * Individual results per player (for formats where partners rotate)
   * Each player gets credited individually for wins/losses
   */
  playerResults?: {
    playerId: string;
    playerName: string;
    won: boolean;
    pointsFor: number;
    pointsAgainst: number;
  }[];

  // ==========================================
  // Timestamps
  // ==========================================

  /** When match was created */
  createdAt: number;

  /** When match started */
  startedAt?: number;

  /** When match was completed */
  completedAt?: number;

  /** Last update */
  updatedAt: number;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if match is completed
 */
export function isMatchCompleted(match: Match): boolean {
  return match.status === 'completed';
}

/**
 * Check if match has a winner
 */
export function hasWinner(match: Match): boolean {
  return !!match.winnerId;
}

/**
 * Check if match is a bye
 */
export function isBye(match: Match): boolean {
  return match.status === 'bye';
}

/**
 * Check if user is a participant in the match
 */
export function isParticipant(match: Match, userId: string): boolean {
  return (
    match.sideA.playerIds.includes(userId) ||
    match.sideB.playerIds.includes(userId)
  );
}

/**
 * Get the side a user is on (or null if not a participant)
 */
export function getUserSide(match: Match, userId: string): 'sideA' | 'sideB' | null {
  if (match.sideA.playerIds.includes(userId)) return 'sideA';
  if (match.sideB.playerIds.includes(userId)) return 'sideB';
  return null;
}
