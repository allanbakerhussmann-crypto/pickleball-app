/**
 * Elimination Bracket Generator
 *
 * Generates single elimination brackets for tournaments.
 * Supports both singles and doubles formats.
 * Seeding is based on DUPR ratings.
 *
 * FILE LOCATION: services/formats/elimination.ts
 * VERSION: V06.30 - Added preserveOrder option for pool-seeded brackets
 *
 * V06.30 Changes:
 * - Added preserveOrder option to BracketConfig
 * - When preserveOrder=true, participants are NOT re-sorted by DUPR
 * - Used for medal brackets where cross-pool seeding is already applied
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { EliminationSettings } from '../../types/formats/formatTypes';

// ============================================
// TYPES
// ============================================

export interface BracketParticipant {
  id: string;
  name: string;
  playerIds: string[];
  duprIds?: string[];
  duprRating?: number;
  seed?: number;
}

export interface BracketConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  participants: BracketParticipant[];
  gameSettings: GameSettings;
  formatSettings: EliminationSettings;
  format: 'singles_elimination' | 'doubles_elimination';
  /** V06.30: If true, don't re-seed by DUPR - preserve input order (default: false) */
  preserveOrder?: boolean;
}

export interface BracketMatch {
  matchId: string;
  roundNumber: number;
  matchInRound: number;
  bracketPosition: number;
  sideA: BracketParticipant | null;
  sideB: BracketParticipant | null;
  winnerId?: string;
  nextMatchId?: string;
  nextMatchSlot?: 'sideA' | 'sideB';
  loserNextMatchId?: string;    // V06.22: For bronze match advancement
  loserNextMatchSlot?: 'sideA' | 'sideB';  // V06.22: Which slot in bronze match
  isBye?: boolean;
  isThirdPlace?: boolean;
}

export interface BracketResult {
  matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  bracket: BracketMatch[];
  rounds: number;
  bracketSize: number;
}

// ============================================
// SEEDING
// ============================================

/**
 * Seed participants by DUPR rating
 * Players without ratings are placed at the end by registration order
 *
 * @param participants - Unsorted participants
 * @returns Seeded participants (1 = highest rated)
 */
export function seedByDupr(participants: BracketParticipant[]): BracketParticipant[] {
  const withRating = participants.filter(p => p.duprRating != null);
  const withoutRating = participants.filter(p => p.duprRating == null);

  // Sort rated players by DUPR (highest first)
  withRating.sort((a, b) => (b.duprRating ?? 0) - (a.duprRating ?? 0));

  // Combine and assign seeds
  const seeded = [...withRating, ...withoutRating];
  seeded.forEach((p, index) => {
    p.seed = index + 1;
  });

  return seeded;
}

/**
 * Calculate bracket size (must be power of 2)
 * Rounds up to nearest power of 2
 *
 * @param numParticipants - Number of participants
 * @returns Bracket size (4, 8, 16, 32, etc.)
 */
export function calculateBracketSize(numParticipants: number): number {
  if (numParticipants <= 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(numParticipants)));
}

/**
 * Calculate number of rounds needed
 *
 * @param bracketSize - Size of bracket (power of 2)
 * @returns Number of rounds
 */
export function calculateRounds(bracketSize: number): number {
  return Math.log2(bracketSize);
}

// ============================================
// BRACKET PLACEMENT
// ============================================

/**
 * Generate standard bracket seed positions
 *
 * Places seeds to ensure top seeds meet as late as possible.
 * For 8-player bracket: [1,8,4,5,2,7,3,6]
 *
 * @param bracketSize - Size of bracket (power of 2)
 * @returns Array of seed positions for first round
 */
export function generateSeedPositions(bracketSize: number): number[] {
  if (bracketSize === 2) return [1, 2];

  // Recursive approach: split and interleave
  const halfSize = bracketSize / 2;
  const topHalf = generateSeedPositions(halfSize);
  const bottomHalf = topHalf.map(seed => bracketSize + 1 - seed);

  // Interleave: top[0], bottom[0], top[1], bottom[1], ...
  const result: number[] = [];
  for (let i = 0; i < halfSize; i++) {
    result.push(topHalf[i], bottomHalf[i]);
  }

  return result;
}

/**
 * Place participants in bracket positions
 *
 * @param seededParticipants - Participants sorted by seed
 * @param bracketSize - Size of bracket
 * @returns Array of participants/byes in bracket order
 */
export function placementBracket(
  seededParticipants: BracketParticipant[],
  bracketSize: number
): (BracketParticipant | null)[] {
  const positions = generateSeedPositions(bracketSize);
  const placement: (BracketParticipant | null)[] = new Array(bracketSize).fill(null);

  // Place each seed in their position
  positions.forEach((seed, index) => {
    if (seed <= seededParticipants.length) {
      placement[index] = seededParticipants[seed - 1];
    }
    // else remains null (bye)
  });

  return placement;
}

// ============================================
// BRACKET GENERATION
// ============================================

/**
 * Generate a single elimination bracket
 *
 * @param config - Bracket configuration
 * @returns Generated bracket with matches
 */
export function generateEliminationBracket(config: BracketConfig): BracketResult {
  const { eventType, eventId, participants, gameSettings, formatSettings, format, preserveOrder = false } = config;

  if (participants.length < 2) {
    return { matches: [], bracket: [], rounds: 0, bracketSize: 0 };
  }

  // V06.30: Seed participants - preserve order if flag set, otherwise seed by DUPR
  // preserveOrder is used for medal brackets where cross-pool seeding is already applied
  const seededParticipants = preserveOrder
    ? participants.map((p, i) => ({ ...p, seed: i + 1 }))
    : seedByDupr([...participants]);

  // Calculate bracket structure
  const bracketSize = calculateBracketSize(participants.length);
  const numRounds = calculateRounds(bracketSize);

  // Place participants in bracket
  const placement = placementBracket(seededParticipants, bracketSize);

  // Generate bracket matches
  const bracket: BracketMatch[] = [];
  let matchCounter = 1;

  // Track match IDs for linking
  const matchIdsByPosition: Map<number, string> = new Map();

  // Helper to generate temp match ID
  const genMatchId = () => `temp_${matchCounter++}`;

  // Generate first round matches
  const firstRoundMatches = bracketSize / 2;

  for (let i = 0; i < firstRoundMatches; i++) {
    const sideA = placement[i * 2];
    const sideB = placement[i * 2 + 1];
    const isBye = !sideA || !sideB;

    const matchId = genMatchId();
    const bracketPosition = i + 1;

    matchIdsByPosition.set(bracketPosition, matchId);

    bracket.push({
      matchId,
      roundNumber: 1,
      matchInRound: i + 1,
      bracketPosition,
      sideA,
      sideB,
      isBye,
    });
  }

  // Generate subsequent rounds
  let previousRoundMatches = firstRoundMatches;
  let previousRoundStartPos = 1;

  for (let round = 2; round <= numRounds; round++) {
    const thisRoundMatches = previousRoundMatches / 2;
    const thisRoundStartPos = previousRoundStartPos + previousRoundMatches;

    for (let i = 0; i < thisRoundMatches; i++) {
      const matchId = genMatchId();
      const bracketPosition = thisRoundStartPos + i;

      matchIdsByPosition.set(bracketPosition, matchId);

      bracket.push({
        matchId,
        roundNumber: round,
        matchInRound: i + 1,
        bracketPosition,
        sideA: null, // Will be filled by winners
        sideB: null,
      });

      // Link previous round matches to this one
      const prevMatch1Pos = previousRoundStartPos + i * 2;
      const prevMatch2Pos = previousRoundStartPos + i * 2 + 1;

      const prevMatch1 = bracket.find(m => m.bracketPosition === prevMatch1Pos);
      const prevMatch2 = bracket.find(m => m.bracketPosition === prevMatch2Pos);

      if (prevMatch1) {
        prevMatch1.nextMatchId = matchId;
        prevMatch1.nextMatchSlot = 'sideA';
      }
      if (prevMatch2) {
        prevMatch2.nextMatchId = matchId;
        prevMatch2.nextMatchSlot = 'sideB';
      }
    }

    previousRoundMatches = thisRoundMatches;
    previousRoundStartPos = thisRoundStartPos;
  }

  // Add third place match if configured
  if (formatSettings.thirdPlaceMatch && numRounds >= 2) {
    const thirdPlaceMatchId = genMatchId();

    bracket.push({
      matchId: thirdPlaceMatchId,
      roundNumber: numRounds,
      matchInRound: 2,
      bracketPosition: previousRoundStartPos + 1, // After finals
      sideA: null,
      sideB: null,
      isThirdPlace: true,
    });

    // V06.22: Link semi-final matches to third place match for loser advancement
    // Find the two semi-final matches (the matches that feed into the final)
    const finalMatch = bracket.find(m => m.roundNumber === numRounds && !m.isThirdPlace);
    if (finalMatch) {
      // Semi-finals are the matches that have nextMatchId pointing to the final
      const semiFinals = bracket.filter(m => m.nextMatchId === finalMatch.matchId);
      semiFinals.forEach((sf, idx) => {
        sf.loserNextMatchId = thirdPlaceMatchId;
        sf.loserNextMatchSlot = idx === 0 ? 'sideA' : 'sideB';
      });
    }
  }

  // Process byes - advance winners automatically
  for (const match of bracket) {
    if (match.isBye && match.roundNumber === 1) {
      // Advance the non-bye participant
      const winner = match.sideA || match.sideB;
      if (winner && match.nextMatchId) {
        const nextMatch = bracket.find(m => m.matchId === match.nextMatchId);
        if (nextMatch) {
          if (match.nextMatchSlot === 'sideA') {
            nextMatch.sideA = winner;
          } else {
            nextMatch.sideB = winner;
          }
        }
      }
    }
  }

  // Convert bracket to Match objects (only non-bye matches)
  const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (const bracketMatch of bracket) {
    // Skip pure bye matches
    if (bracketMatch.isBye) continue;

    // Build sideA - only include defined fields (Firestore rejects undefined)
    const sideA: Record<string, unknown> = bracketMatch.sideA
      ? {
          id: bracketMatch.sideA.id,
          name: bracketMatch.sideA.name,
          playerIds: bracketMatch.sideA.playerIds || [],
        }
      : {
          id: 'TBD',
          name: 'TBD',
          playerIds: [],
        };
    // Only add optional fields if they have values
    if (bracketMatch.sideA?.duprIds) sideA.duprIds = bracketMatch.sideA.duprIds;
    if (bracketMatch.sideA?.duprRating !== undefined) sideA.duprRating = bracketMatch.sideA.duprRating;
    if (bracketMatch.sideA?.seed !== undefined) sideA.seed = bracketMatch.sideA.seed;

    // Build sideB - only include defined fields (Firestore rejects undefined)
    const sideB: Record<string, unknown> = bracketMatch.sideB
      ? {
          id: bracketMatch.sideB.id,
          name: bracketMatch.sideB.name,
          playerIds: bracketMatch.sideB.playerIds || [],
        }
      : {
          id: 'TBD',
          name: 'TBD',
          playerIds: [],
        };
    // Only add optional fields if they have values
    if (bracketMatch.sideB?.duprIds) sideB.duprIds = bracketMatch.sideB.duprIds;
    if (bracketMatch.sideB?.duprRating !== undefined) sideB.duprRating = bracketMatch.sideB.duprRating;
    if (bracketMatch.sideB?.seed !== undefined) sideB.seed = bracketMatch.sideB.seed;

    // Build match object - only include defined fields
    const match: Record<string, unknown> = {
      matchId: bracketMatch.matchId,  // Temp ID for bracket linking (e.g., temp_1, temp_2, etc.)
      eventType,
      eventId,
      format,
      gameSettings,
      sideA,
      sideB,
      roundNumber: bracketMatch.roundNumber,
      matchNumber: bracketMatch.matchInRound,
      bracketPosition: bracketMatch.bracketPosition,
      status: 'scheduled',
      scores: [],
    };
    // Only add optional fields if they have values
    if (bracketMatch.nextMatchId) match.nextMatchId = bracketMatch.nextMatchId;
    if (bracketMatch.nextMatchSlot) match.nextMatchSlot = bracketMatch.nextMatchSlot;
    if (bracketMatch.loserNextMatchId) match.loserNextMatchId = bracketMatch.loserNextMatchId;  // V06.22
    if (bracketMatch.loserNextMatchSlot) match.loserNextMatchSlot = bracketMatch.loserNextMatchSlot;  // V06.22
    if (bracketMatch.isThirdPlace) match.isThirdPlace = bracketMatch.isThirdPlace;

    matches.push(match as Omit<Match, 'id' | 'createdAt' | 'updatedAt'>);
  }

  return {
    matches,
    bracket,
    rounds: numRounds,
    bracketSize,
  };
}

/**
 * Advance a winner in the bracket
 * Updates the next match with the winner's information
 *
 * @param bracket - Current bracket state
 * @param matchId - Match ID that was completed
 * @param winnerId - ID of the winning participant
 * @returns Updated bracket
 */
export function advanceWinner(
  bracket: BracketMatch[],
  matchId: string,
  winnerId: string
): BracketMatch[] {
  const match = bracket.find(m => m.matchId === matchId);
  if (!match) return bracket;

  // Determine winner participant
  const winner = match.sideA?.id === winnerId ? match.sideA : match.sideB;
  if (!winner) return bracket;

  // Mark this match as won
  match.winnerId = winnerId;

  // Advance to next match
  if (match.nextMatchId && match.nextMatchSlot) {
    const nextMatch = bracket.find(m => m.matchId === match.nextMatchId);
    if (nextMatch) {
      if (match.nextMatchSlot === 'sideA') {
        nextMatch.sideA = winner;
      } else {
        nextMatch.sideB = winner;
      }
    }
  }

  return [...bracket];
}

/**
 * Get round name (Finals, Semi-Finals, Quarter-Finals, etc.)
 *
 * @param roundNumber - Current round number
 * @param totalRounds - Total rounds in bracket
 * @returns Round name
 */
export function getRoundName(roundNumber: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - roundNumber;

  switch (roundsFromEnd) {
    case 0:
      return 'Finals';
    case 1:
      return 'Semi-Finals';
    case 2:
      return 'Quarter-Finals';
    default:
      return `Round ${roundNumber}`;
  }
}
