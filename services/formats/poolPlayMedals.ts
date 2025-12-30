/**
 * Pool Play → Medals Format Generator
 *
 * The most common tournament format in pickleball.
 * Two-stage format:
 *   1. Pool Stage - Round robin within small groups
 *   2. Medal Stage - Single elimination bracket with bronze match
 *
 * Uses existing roundRobin and elimination generators internally.
 *
 * FILE LOCATION: services/formats/poolPlayMedals.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { PoolPlayMedalsSettings } from '../../types/formats/formatTypes';
import {
  generateRoundRobinPairings,
  calculateRoundRobinStandings,
  type RoundRobinParticipant,
  type RoundRobinStanding,
} from './roundRobin';
import {
  generateEliminationBracket,
  type BracketParticipant,
} from './elimination';

// ============================================
// TYPES
// ============================================

export interface PoolParticipant {
  id: string;
  name: string;
  playerIds: string[];
  duprIds?: string[];
  duprRating?: number;
  seed?: number;
}

export interface Pool {
  poolNumber: number;
  poolName: string; // "Pool A", "Pool B", etc.
  participants: PoolParticipant[];
}

export interface PoolPlayConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  participants: PoolParticipant[];
  gameSettings: GameSettings;
  formatSettings: PoolPlayMedalsSettings;
  startDate?: number;
}

export interface PoolStanding extends RoundRobinStanding {
  poolNumber: number;
  poolName: string;
  qualified: boolean;
  qualifiedAs: 'top' | 'best_remaining' | null;
  /** Whether this participant advances to the plate/consolation bracket */
  qualifiedForPlate?: boolean;
}

export interface PoolPlayResult {
  pools: Pool[];
  poolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  poolCount: number;
  matchesPerPool: number;
}

export interface MedalBracketConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  qualifiedParticipants: PoolParticipant[];
  gameSettings: GameSettings;
  formatSettings: PoolPlayMedalsSettings;
}

export interface MedalBracketResult {
  bracketMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  bronzeMatch: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> | null;
  bracketSize: number;
  rounds: number;
}

export interface PlateBracketResult {
  plateMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  plateThirdPlaceMatch: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> | null;
  bracketSize: number;
  rounds: number;
}

export interface PoolPlayMedalsResult {
  pools: Pool[];
  poolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  // Medal bracket generated after pools complete
  generateMedalBracket: (poolStandings: PoolStanding[][]) => MedalBracketResult;
  // Plate bracket generated after pools complete (if enabled)
  generatePlateBracket: (poolStandings: PoolStanding[][]) => PlateBracketResult;
}

// ============================================
// POOL ASSIGNMENT
// ============================================

/**
 * Get pool name from number (A, B, C, ... Z, AA, AB, ...)
 */
export function getPoolName(poolNumber: number): string {
  if (poolNumber <= 26) {
    return `Pool ${String.fromCharCode(64 + poolNumber)}`;
  }
  const first = Math.floor((poolNumber - 1) / 26);
  const second = ((poolNumber - 1) % 26) + 1;
  return `Pool ${String.fromCharCode(64 + first)}${String.fromCharCode(64 + second)}`;
}

/**
 * Assign participants to pools using snake draft seeding
 *
 * Snake draft ensures balanced pools:
 * - Pool A gets seeds 1, 4, 5, 8, ...
 * - Pool B gets seeds 2, 3, 6, 7, ...
 *
 * This prevents all top seeds from being in the same pool.
 *
 * @param participants - Seeded participants (highest DUPR first)
 * @param poolCount - Number of pools to create
 * @returns Array of pools with assigned participants
 */
export function assignParticipantsToPools(
  participants: PoolParticipant[],
  poolCount: number
): Pool[] {
  // Seed participants by DUPR
  const seeded = [...participants].sort((a, b) => {
    const ratingA = a.duprRating ?? 0;
    const ratingB = b.duprRating ?? 0;
    return ratingB - ratingA;
  });

  // Assign seeds
  seeded.forEach((p, index) => {
    p.seed = index + 1;
  });

  // Initialize pools
  const pools: Pool[] = [];
  for (let i = 0; i < poolCount; i++) {
    pools.push({
      poolNumber: i + 1,
      poolName: getPoolName(i + 1),
      participants: [],
    });
  }

  // Snake draft assignment
  let direction = 1; // 1 = forward, -1 = backward
  let poolIndex = 0;

  for (const participant of seeded) {
    pools[poolIndex].participants.push(participant);

    // Move to next pool
    poolIndex += direction;

    // Reverse direction at ends
    if (poolIndex >= poolCount) {
      poolIndex = poolCount - 1;
      direction = -1;
    } else if (poolIndex < 0) {
      poolIndex = 0;
      direction = 1;
    }
  }

  return pools;
}

/**
 * Calculate number of pools based on participants and pool size
 */
export function calculatePoolCount(
  participantCount: number,
  poolSize: number
): number {
  return Math.ceil(participantCount / poolSize);
}

// ============================================
// POOL STAGE GENERATION
// ============================================

/**
 * Generate pool stage matches
 *
 * Creates round robin matches within each pool.
 *
 * @param config - Pool play configuration
 * @returns Pools and pool matches
 */
export function generatePoolStage(config: PoolPlayConfig): PoolPlayResult {
  const { eventType, eventId, participants, gameSettings, formatSettings } = config;
  const { poolSize } = formatSettings;

  if (participants.length < 2) {
    return { pools: [], poolMatches: [], poolCount: 0, matchesPerPool: 0 };
  }

  // Calculate pool count
  const poolCount = calculatePoolCount(participants.length, poolSize);

  // Assign participants to pools
  const pools = assignParticipantsToPools(participants, poolCount);

  // Generate round robin matches for each pool
  const allPoolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let globalMatchNumber = 1;

  for (const pool of pools) {
    // Generate pairings for this pool
    const poolParticipants: RoundRobinParticipant[] = pool.participants.map(p => ({
      id: p.id,
      name: p.name,
      playerIds: p.playerIds,
      duprIds: p.duprIds,
      duprRating: p.duprRating,
    }));

    const rounds = generateRoundRobinPairings(poolParticipants);

    // Convert to matches
    for (const round of rounds) {
      for (const pairing of round.pairings) {
        if (!pairing.sideA || !pairing.sideB) continue; // Skip byes

        // CRITICAL: Validate teams are different (prevent data corruption)
        if (pairing.sideA.id === pairing.sideB.id) {
          console.error(`[Pool Play] Skipping invalid pairing: same team ID on both sides: ${pairing.sideA.id}`);
          continue;
        }
        if (pairing.sideA.name.toLowerCase() === pairing.sideB.name.toLowerCase()) {
          console.error(`[Pool Play] Skipping invalid pairing: same team name on both sides: ${pairing.sideA.name}`);
          continue;
        }

        // Build sideA - only include optional fields if defined (Firestore rejects undefined)
        const sideA: any = {
          id: pairing.sideA.id,
          name: pairing.sideA.name,
          playerIds: pairing.sideA.playerIds,
        };
        if (pairing.sideA.duprIds) sideA.duprIds = pairing.sideA.duprIds;
        if (pairing.sideA.duprRating !== undefined) sideA.duprRating = pairing.sideA.duprRating;

        // Build sideB - only include optional fields if defined
        const sideB: any = {
          id: pairing.sideB.id,
          name: pairing.sideB.name,
          playerIds: pairing.sideB.playerIds,
        };
        if (pairing.sideB.duprIds) sideB.duprIds = pairing.sideB.duprIds;
        if (pairing.sideB.duprRating !== undefined) sideB.duprRating = pairing.sideB.duprRating;

        const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
          eventType,
          eventId,
          format: 'pool_play_medals',
          gameSettings,
          sideA,
          sideB,
          roundNumber: round.roundNumber,
          matchNumber: globalMatchNumber++,
          poolGroup: pool.poolName,
          status: 'scheduled',
          scores: [],
        };

        allPoolMatches.push(match);
      }
    }
  }

  // Calculate matches per pool (for a full pool)
  const matchesPerPool = (poolSize * (poolSize - 1)) / 2;

  return {
    pools,
    poolMatches: allPoolMatches,
    poolCount,
    matchesPerPool,
  };
}

// ============================================
// POOL STANDINGS
// ============================================

/**
 * Calculate standings for a single pool
 *
 * @param pool - Pool with participants
 * @param matches - Completed matches for this pool
 * @param tiebreakers - Tiebreaker order from settings
 * @returns Sorted standings for the pool
 */
export function calculatePoolStandings(
  pool: Pool,
  matches: Match[],
  tiebreakers: PoolPlayMedalsSettings['tiebreakers']
): PoolStanding[] {
  // Use round robin standings calculation
  const poolParticipants: RoundRobinParticipant[] = pool.participants.map(p => ({
    id: p.id,
    name: p.name,
    playerIds: p.playerIds,
    duprIds: p.duprIds,
    duprRating: p.duprRating,
  }));

  const poolMatches = matches.filter(m => m.poolGroup === pool.poolName);
  const baseStandings = calculateRoundRobinStandings(poolParticipants, poolMatches);

  // Apply custom tiebreaker order
  const standings = baseStandings.map(s => ({
    ...s,
    poolNumber: pool.poolNumber,
    poolName: pool.poolName,
    qualified: false,
    qualifiedAs: null as 'top' | 'best_remaining' | null,
  }));

  // Re-sort with custom tiebreakers
  standings.sort((a, b) => {
    for (const tiebreaker of tiebreakers) {
      let comparison = 0;

      switch (tiebreaker) {
        case 'wins':
          comparison = b.wins - a.wins;
          break;
        case 'head_to_head':
          // Head-to-head requires checking direct match
          const directMatch = poolMatches.find(
            m =>
              m.status === 'completed' &&
              ((m.sideA.id === a.participant.id && m.sideB.id === b.participant.id) ||
               (m.sideA.id === b.participant.id && m.sideB.id === a.participant.id))
          );
          if (directMatch?.winnerId === a.participant.id) comparison = -1;
          else if (directMatch?.winnerId === b.participant.id) comparison = 1;
          break;
        case 'point_diff':
          comparison = b.pointDifferential - a.pointDifferential;
          break;
        case 'points_scored':
          comparison = b.pointsFor - a.pointsFor;
          break;
      }

      if (comparison !== 0) return comparison;
    }
    return 0;
  });

  // Reassign ranks after custom sort
  standings.forEach((s, index) => {
    s.rank = index + 1;
  });

  return standings;
}

/**
 * Determine which participants qualify for medal bracket and plate bracket
 *
 * @param allPoolStandings - Standings from all pools
 * @param settings - Pool play settings
 * @returns All standings with qualified flags set
 */
export function determineQualifiers(
  allPoolStandings: PoolStanding[][],
  settings: PoolPlayMedalsSettings
): PoolStanding[][] {
  const { advancementRule, advancementCount } = settings;

  // Plate settings from format (cast to access extended fields)
  const plateEnabled = (settings as any).plateEnabled === true;
  const advanceToPlatePerPool = (settings as any).advanceToPlatePerPool || 1;

  // Mark top N from each pool
  let qualifiersPerPool = 0;
  switch (advancementRule) {
    case 'top_1':
      qualifiersPerPool = 1;
      break;
    case 'top_2':
      qualifiersPerPool = 2;
      break;
    case 'top_n_plus_best':
      qualifiersPerPool = 1; // Top 1 guaranteed, plus best remaining
      break;
  }

  // Mark top qualifiers for main bracket
  for (const poolStandings of allPoolStandings) {
    for (let i = 0; i < qualifiersPerPool && i < poolStandings.length; i++) {
      poolStandings[i].qualified = true;
      poolStandings[i].qualifiedAs = 'top';
    }

    // Mark plate qualifiers (those who don't qualify for main bracket)
    // advanceToPlatePerPool controls how many non-main-bracket finishers go to plate
    // We take from 3rd place downward (not bottom up)
    // e.g., if top 2 go to main and plate takes 2: 3rd and 4th go to plate
    if (plateEnabled && poolStandings.length > qualifiersPerPool) {
      const nonQualifiedCount = poolStandings.length - qualifiersPerPool;
      const plateCount = Math.min(advanceToPlatePerPool, nonQualifiedCount);

      // Mark from first non-qualified position downward
      // e.g., if qualifiersPerPool=2, start at index 2 (3rd place)
      for (let i = 0; i < plateCount; i++) {
        const plateIndex = qualifiersPerPool + i;
        if (plateIndex < poolStandings.length) {
          poolStandings[plateIndex].qualifiedForPlate = true;
        }
      }
    }
  }

  // Handle "top N + best remaining" rule
  if (advancementRule === 'top_n_plus_best' && advancementCount) {
    const topQualifiedCount = allPoolStandings.reduce(
      (sum, pool) => sum + pool.filter(s => s.qualified).length,
      0
    );
    const remainingSlots = advancementCount - topQualifiedCount;

    if (remainingSlots > 0) {
      // Collect all non-qualified participants (exclude plate qualifiers from main bracket consideration)
      const nonQualified: PoolStanding[] = [];
      for (const poolStandings of allPoolStandings) {
        for (const standing of poolStandings) {
          if (!standing.qualified && !standing.qualifiedForPlate) {
            nonQualified.push(standing);
          }
        }
      }

      // Sort by record (same criteria as pool standings)
      nonQualified.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDifferential !== a.pointDifferential) {
          return b.pointDifferential - a.pointDifferential;
        }
        return b.pointsFor - a.pointsFor;
      });

      // Qualify best remaining
      for (let i = 0; i < remainingSlots && i < nonQualified.length; i++) {
        nonQualified[i].qualified = true;
        nonQualified[i].qualifiedAs = 'best_remaining';
      }
    }
  }

  return allPoolStandings;
}

/**
 * Get all qualified participants for medal bracket
 *
 * @param allPoolStandings - Standings with qualified flags
 * @returns Qualified participants sorted for seeding
 */
export function getQualifiedParticipants(
  allPoolStandings: PoolStanding[][]
): PoolParticipant[] {
  const qualified: PoolStanding[] = [];

  for (const poolStandings of allPoolStandings) {
    for (const standing of poolStandings) {
      if (standing.qualified) {
        qualified.push(standing);
      }
    }
  }

  // Sort: top qualifiers first (by pool finish), then best remaining
  qualified.sort((a, b) => {
    // Top qualifiers before best remaining
    if (a.qualifiedAs === 'top' && b.qualifiedAs !== 'top') return -1;
    if (a.qualifiedAs !== 'top' && b.qualifiedAs === 'top') return 1;

    // Within same qualification type, sort by rank then pool record
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointDifferential - a.pointDifferential;
  });

  return qualified.map(s => ({
    id: s.participant.id,
    name: s.participant.name,
    playerIds: s.participant.playerIds,
    duprIds: s.participant.duprIds,
    duprRating: s.participant.duprRating,
  }));
}

/**
 * Get all participants who qualified for plate/consolation bracket
 *
 * Uses cross-pool seeding:
 * - If 1 per pool: 3rd Pool A vs 3rd Pool D, 3rd Pool B vs 3rd Pool C
 * - If 2 per pool: 3rd Pool A vs 4th Pool B, etc.
 *
 * @param allPoolStandings - Standings with qualified flags
 * @returns Plate-qualified participants sorted for bracket seeding
 */
export function getPlateParticipants(
  allPoolStandings: PoolStanding[][]
): PoolParticipant[] {
  const plateQualified: PoolStanding[] = [];

  for (const poolStandings of allPoolStandings) {
    for (const standing of poolStandings) {
      if (standing.qualifiedForPlate) {
        plateQualified.push(standing);
      }
    }
  }

  if (plateQualified.length === 0) return [];

  // Group by finishing rank (3rd place together, 4th place together, etc.)
  const byRank: Map<number, PoolStanding[]> = new Map();
  for (const standing of plateQualified) {
    const group = byRank.get(standing.rank) || [];
    group.push(standing);
    byRank.set(standing.rank, group);
  }

  // Sort each rank group by pool number for cross-pool matchups
  // Pool A vs Pool D, Pool B vs Pool C (reverse order cross)
  for (const [, group] of byRank) {
    group.sort((a, b) => a.poolNumber - b.poolNumber);
  }

  // Build seeded list: best finishers first, with cross-pool ordering
  // For 4 pools with 1 per pool: A3, D3, B3, C3 (so A3 plays D3, B3 plays C3)
  // For 4 pools with 2 per pool: A3, B4, C3, D4, B3, A4, D3, C4 (cross-seeded)
  const seeded: PoolStanding[] = [];
  const sortedRanks = Array.from(byRank.keys()).sort((a, b) => a - b);

  for (const rank of sortedRanks) {
    const group = byRank.get(rank)!;
    const poolCount = group.length;

    if (poolCount <= 1) {
      seeded.push(...group);
    } else {
      // Cross-seed: 1st pool with last pool, 2nd pool with second-to-last, etc.
      const half = Math.ceil(poolCount / 2);
      for (let i = 0; i < half; i++) {
        seeded.push(group[i]); // Pool A, B, ...
        const crossIndex = poolCount - 1 - i;
        if (crossIndex !== i) {
          seeded.push(group[crossIndex]); // Pool D, C, ...
        }
      }
    }
  }

  // Assign seeds based on sorted order
  return seeded.map((s, index) => ({
    id: s.participant.id,
    name: s.participant.name,
    playerIds: s.participant.playerIds,
    duprIds: s.participant.duprIds,
    duprRating: s.participant.duprRating,
    seed: index + 1,
  }));
}

// ============================================
// MEDAL BRACKET GENERATION
// ============================================

/**
 * Generate medal bracket from qualified participants
 *
 * Called after pool stage is complete.
 *
 * @param config - Medal bracket configuration
 * @returns Medal bracket matches including bronze match
 */
export function generateMedalBracket(config: MedalBracketConfig): MedalBracketResult {
  const { eventType, eventId, qualifiedParticipants, gameSettings, formatSettings } = config;
  const { bronzeMatch } = formatSettings;

  if (qualifiedParticipants.length < 2) {
    return { bracketMatches: [], bronzeMatch: null, bracketSize: 0, rounds: 0 };
  }

  // Generate elimination bracket
  const bracketParticipants: BracketParticipant[] = qualifiedParticipants.map(p => ({
    id: p.id,
    name: p.name,
    playerIds: p.playerIds,
    duprIds: p.duprIds,
    duprRating: p.duprRating,
  }));

  const bracketResult = generateEliminationBracket({
    eventType,
    eventId,
    participants: bracketParticipants,
    gameSettings,
    formatSettings: {
      thirdPlaceMatch: bronzeMatch === 'yes',
      consolationBracket: false,
    },
    format: gameSettings.playType === 'singles' ? 'singles_elimination' : 'doubles_elimination',
  });

  // Update format to pool_play_medals
  const bracketMatches = bracketResult.matches.map(m => ({
    ...m,
    format: 'pool_play_medals' as const,
  }));

  // Extract bronze match if present
  let bronzeMatchData: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> | null = null;

  if (bronzeMatch === 'yes') {
    const thirdPlaceBracket = bracketResult.bracket.find(m => m.isThirdPlace);
    if (thirdPlaceBracket) {
      bronzeMatchData = bracketMatches.find(
        m => m.bracketPosition === thirdPlaceBracket.bracketPosition
      ) || null;
    }
  }

  return {
    bracketMatches,
    bronzeMatch: bronzeMatchData,
    bracketSize: bracketResult.bracketSize,
    rounds: bracketResult.rounds,
  };
}

/**
 * Generate plate/consolation bracket from non-qualifying participants
 *
 * Called after pool stage is complete. Matches are marked with bracketType: 'plate'.
 *
 * @param config - Medal bracket configuration (reused for plate)
 * @param plateParticipants - Participants who qualified for plate bracket
 * @param plateSettings - Plate-specific settings
 * @returns Plate bracket matches including optional 3rd place match
 */
export function generatePlateBracket(
  config: Omit<MedalBracketConfig, 'qualifiedParticipants'>,
  plateParticipants: PoolParticipant[],
  plateSettings: {
    plateFormat?: 'single_elim' | 'round_robin';
    plateThirdPlace?: boolean;
    plateName?: string;
  }
): PlateBracketResult {
  const { eventType, eventId, gameSettings } = config;
  const { plateFormat = 'single_elim', plateThirdPlace = false } = plateSettings;

  if (plateParticipants.length < 2) {
    return { plateMatches: [], plateThirdPlaceMatch: null, bracketSize: 0, rounds: 0 };
  }

  // Convert to bracket participants
  const bracketParticipants: BracketParticipant[] = plateParticipants.map(p => ({
    id: p.id,
    name: p.name,
    playerIds: p.playerIds,
    duprIds: p.duprIds,
    duprRating: p.duprRating,
  }));

  if (plateFormat === 'round_robin') {
    // Generate round robin for plate participants
    const rounds = generateRoundRobinPairings(bracketParticipants);
    const plateMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    let matchNumber = 1;

    for (const round of rounds) {
      for (const pairing of round.pairings) {
        if (!pairing.sideA || !pairing.sideB) continue;

        const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
          eventType,
          eventId,
          format: 'pool_play_medals',
          gameSettings,
          sideA: {
            id: pairing.sideA.id,
            name: pairing.sideA.name,
            playerIds: pairing.sideA.playerIds,
            duprIds: pairing.sideA.duprIds,
            duprRating: pairing.sideA.duprRating,
          },
          sideB: {
            id: pairing.sideB.id,
            name: pairing.sideB.name,
            playerIds: pairing.sideB.playerIds,
            duprIds: pairing.sideB.duprIds,
            duprRating: pairing.sideB.duprRating,
          },
          roundNumber: round.roundNumber,
          matchNumber: matchNumber++,
          stage: 'plate',
          bracketType: 'plate',
          status: 'scheduled',
          scores: [],
        };

        plateMatches.push(match);
      }
    }

    return {
      plateMatches,
      plateThirdPlaceMatch: null,
      bracketSize: plateParticipants.length,
      rounds: rounds.length,
    };
  }

  // Default: Single elimination plate bracket
  const bracketResult = generateEliminationBracket({
    eventType,
    eventId,
    participants: bracketParticipants,
    gameSettings,
    formatSettings: {
      thirdPlaceMatch: plateThirdPlace,
      consolationBracket: false,
    },
    format: gameSettings.playType === 'singles' ? 'singles_elimination' : 'doubles_elimination',
  });

  // Mark all matches as plate bracket
  const plateMatches = bracketResult.matches.map(m => ({
    ...m,
    format: 'pool_play_medals' as const,
    stage: 'plate' as const,
    bracketType: 'plate' as const,
  }));

  // Extract plate 3rd place match if present
  let plateThirdPlaceMatch: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> | null = null;

  if (plateThirdPlace) {
    const thirdPlaceBracket = bracketResult.bracket.find(m => m.isThirdPlace);
    if (thirdPlaceBracket) {
      plateThirdPlaceMatch = plateMatches.find(
        m => m.bracketPosition === thirdPlaceBracket.bracketPosition
      ) || null;
    }
  }

  return {
    plateMatches,
    plateThirdPlaceMatch,
    bracketSize: bracketResult.bracketSize,
    rounds: bracketResult.rounds,
  };
}

// ============================================
// MAIN GENERATOR
// ============================================

/**
 * Generate Pool Play → Medals tournament
 *
 * This is a compound format that:
 * 1. Generates pool stage matches immediately
 * 2. Provides a function to generate medal bracket after pools complete
 *
 * @param config - Pool play configuration
 * @returns Pool stage data and medal bracket generator function
 */
export function generatePoolPlayMedals(config: PoolPlayConfig): PoolPlayMedalsResult {
  // Generate pool stage
  const poolResult = generatePoolStage(config);

  // Return pool data and functions to generate brackets later
  return {
    pools: poolResult.pools,
    poolMatches: poolResult.poolMatches,

    generateMedalBracket: (poolStandings: PoolStanding[][]) => {
      // Determine qualifiers (also sets plate qualifiers)
      const updatedStandings = determineQualifiers(poolStandings, config.formatSettings);

      // Get main bracket qualified participants
      const qualifiedParticipants = getQualifiedParticipants(updatedStandings);

      // Generate medal bracket
      return generateMedalBracket({
        eventType: config.eventType,
        eventId: config.eventId,
        qualifiedParticipants,
        gameSettings: config.gameSettings,
        formatSettings: config.formatSettings,
      });
    },

    generatePlateBracket: (poolStandings: PoolStanding[][]) => {
      // Determine qualifiers (sets both main and plate qualifiers)
      const updatedStandings = determineQualifiers(poolStandings, config.formatSettings);

      // Get plate bracket participants
      const plateParticipants = getPlateParticipants(updatedStandings);

      // Get plate settings from format (cast to access extended fields)
      const formatWithPlate = config.formatSettings as any;

      // Generate plate bracket
      return generatePlateBracket(
        {
          eventType: config.eventType,
          eventId: config.eventId,
          gameSettings: config.gameSettings,
          formatSettings: config.formatSettings,
        },
        plateParticipants,
        {
          plateFormat: formatWithPlate.plateFormat || 'single_elim',
          plateThirdPlace: formatWithPlate.plateThirdPlace || false,
          plateName: formatWithPlate.plateName || 'Plate',
        }
      );
    },
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if pool stage is complete
 *
 * @param poolMatches - All pool matches
 * @returns True if all matches are completed
 */
export function isPoolStageComplete(poolMatches: Match[]): boolean {
  return poolMatches.every(
    m => m.status === 'completed' || m.status === 'forfeit' || m.status === 'bye'
  );
}

/**
 * Get pool stage progress
 *
 * @param poolMatches - All pool matches
 * @returns Progress object with counts and percentage
 */
export function getPoolStageProgress(poolMatches: Match[]): {
  total: number;
  completed: number;
  remaining: number;
  percentComplete: number;
} {
  const total = poolMatches.length;
  const completed = poolMatches.filter(
    m => m.status === 'completed' || m.status === 'forfeit' || m.status === 'bye'
  ).length;

  return {
    total,
    completed,
    remaining: total - completed,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Get matches for a specific pool
 *
 * @param poolMatches - All pool matches
 * @param poolName - Pool name (e.g., "Pool A")
 * @returns Matches for that pool
 */
export function getMatchesForPool(
  poolMatches: Match[],
  poolName: string
): Match[] {
  return poolMatches.filter(m => m.poolGroup === poolName);
}

// ============================================
// BRACKET VALIDATION (V06.21)
// ============================================

/**
 * Result of bracket readiness validation
 */
export interface BracketReadiness {
  /** Whether bracket generation can proceed */
  ready: boolean;
  /** Whether all pool matches are complete */
  allPoolsComplete: boolean;
  /** Number of incomplete pool matches */
  incompleteMatchCount: number;
  /** Number of qualified participants for bracket */
  qualifierCount: number;
  /** Minimum qualifiers needed (always 2) */
  minimumRequired: number;
  /** List of validation errors */
  errors: string[];
}

/**
 * Validate that bracket can be generated from pool results.
 * Fails closed - all conditions must pass.
 *
 * Checks:
 * 1. All pool matches are completed/forfeit/bye
 * 2. At least 2 qualifiers exist
 * 3. No duplicate qualifier IDs
 *
 * @param poolMatches - All pool matches
 * @param qualifiedParticipants - Participants who qualified for bracket
 * @returns Validation result with ready status and errors
 */
export function validateBracketReadiness(
  poolMatches: Match[],
  qualifiedParticipants: PoolParticipant[]
): BracketReadiness {
  const errors: string[] = [];

  // 1. All pool matches completed/forfeit/bye
  const incomplete = poolMatches.filter(m =>
    (m.stage === 'pool' || m.poolGroup) &&
    m.status !== 'completed' &&
    m.status !== 'forfeit' &&
    m.status !== 'bye'
  );
  if (incomplete.length > 0) {
    errors.push(`${incomplete.length} pool match(es) not complete`);
  }

  // 2. Minimum 2 qualifiers
  if (qualifiedParticipants.length < 2) {
    errors.push(`Need at least 2 qualifiers, have ${qualifiedParticipants.length}`);
  }

  // 3. No duplicate qualifier IDs
  const ids = qualifiedParticipants.map(p => p.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    const uniqueDuplicates = [...new Set(duplicates)];
    errors.push(`Duplicate qualifiers: ${uniqueDuplicates.join(', ')}`);
  }

  return {
    ready: errors.length === 0,
    allPoolsComplete: incomplete.length === 0,
    incompleteMatchCount: incomplete.length,
    qualifierCount: qualifiedParticipants.length,
    minimumRequired: 2,
    errors,
  };
}
