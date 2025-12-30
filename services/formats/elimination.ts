/**
 * Elimination Bracket Generator
 *
 * Generates single elimination brackets for tournaments.
 * Supports both singles and doubles formats.
 * Seeding is based on DUPR ratings.
 *
 * FILE LOCATION: services/formats/elimination.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { EliminationSettings, CompetitionFormat } from '../../types/formats/formatTypes';

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
  const { eventType, eventId, participants, gameSettings, formatSettings, format } = config;

  if (participants.length < 2) {
    return { matches: [], bracket: [], rounds: 0, bracketSize: 0 };
  }

  // Seed participants by DUPR
  const seededParticipants = seedByDupr([...participants]);

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

    const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & { matchId?: string } = {
      matchId: bracketMatch.matchId,  // Temp ID for bracket linking (e.g., temp_1, temp_2, etc.)
      eventType,
      eventId,
      format,
      gameSettings,
      sideA: bracketMatch.sideA
        ? {
            id: bracketMatch.sideA.id,
            name: bracketMatch.sideA.name,
            playerIds: bracketMatch.sideA.playerIds,
            duprIds: bracketMatch.sideA.duprIds,
            duprRating: bracketMatch.sideA.duprRating,
            seed: bracketMatch.sideA.seed,
          }
        : {
            id: 'TBD',
            name: 'TBD',
            playerIds: [],
          },
      sideB: bracketMatch.sideB
        ? {
            id: bracketMatch.sideB.id,
            name: bracketMatch.sideB.name,
            playerIds: bracketMatch.sideB.playerIds,
            duprIds: bracketMatch.sideB.duprIds,
            duprRating: bracketMatch.sideB.duprRating,
            seed: bracketMatch.sideB.seed,
          }
        : {
            id: 'TBD',
            name: 'TBD',
            playerIds: [],
          },
      roundNumber: bracketMatch.roundNumber,
      matchNumber: bracketMatch.matchInRound,
      bracketPosition: bracketMatch.bracketPosition,
      nextMatchId: bracketMatch.nextMatchId,
      nextMatchSlot: bracketMatch.nextMatchSlot,  // Also include nextMatchSlot for completeness
      status: bracketMatch.sideA && bracketMatch.sideB ? 'scheduled' : 'scheduled',
      scores: [],
    };

    matches.push(match);
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
