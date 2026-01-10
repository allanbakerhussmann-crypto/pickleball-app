/**
 * Box League Standings Service
 *
 * Calculates weekly standings DERIVED from match results.
 * Standings are recomputable, not incrementally updated.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueStandings.ts
 * VERSION: V07.25
 */

import type { Match } from '../../types/game/match';
import type {
  BoxLeagueWeek,
  BoxStanding,
  BoxStandingsSnapshot,
  BoxAssignment,
} from '../../types/rotatingDoublesBox';
import { getMatchesForBox } from './boxLeagueMatchFactory';

// ============================================
// PLAYER STATS (INTERMEDIATE)
// ============================================

interface PlayerStats {
  playerId: string;
  playerName: string;
  boxNumber: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  headToHead: Map<string, 'win' | 'loss'>; // For h2h tiebreaker
  wasAbsent: boolean;
  substituteId?: string;
}

// ============================================
// STANDINGS CALCULATION
// ============================================

/**
 * Calculate weekly standings from match results
 *
 * This is the main entry point for standings calculation.
 * Returns standings for all boxes in the week.
 */
export async function calculateWeekStandings(
  leagueId: string,
  week: BoxLeagueWeek
): Promise<BoxStanding[]> {
  const allStandings: BoxStanding[] = [];

  // Calculate standings for each box
  for (const boxAssignment of week.boxAssignments) {
    const boxStandings = await calculateBoxStandings(
      leagueId,
      week,
      boxAssignment
    );
    allStandings.push(...boxStandings);
  }

  return allStandings;
}

/**
 * Calculate standings for a single box
 */
export async function calculateBoxStandings(
  leagueId: string,
  week: BoxLeagueWeek,
  boxAssignment: BoxAssignment
): Promise<BoxStanding[]> {
  const { boxNumber, playerIds } = boxAssignment;

  // Fetch all completed matches for this box
  const matches = await getMatchesForBox(leagueId, week.weekNumber, boxNumber);
  const completedMatches = matches.filter((m) => m.status === 'completed');

  // Initialize stats for each player
  const playerStats = new Map<string, PlayerStats>();
  for (const playerId of playerIds) {
    playerStats.set(playerId, {
      playerId,
      playerName: '', // Will be filled from match data
      boxNumber,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsDiff: 0,
      headToHead: new Map(),
      wasAbsent: false,
    });
  }

  // Check for absences
  for (const absence of week.absences || []) {
    const stats = playerStats.get(absence.playerId);
    if (stats) {
      stats.wasAbsent = true;
      stats.substituteId = absence.substituteId;
    }
  }

  // Process each completed match
  for (const match of completedMatches) {
    processMatchForStats(match, playerStats);
  }

  // Calculate point differential
  for (const stats of playerStats.values()) {
    stats.pointsDiff = stats.pointsFor - stats.pointsAgainst;
  }

  // Sort players by tiebreakers
  const sortedPlayers = sortByTiebreakers(
    Array.from(playerStats.values()),
    week.rulesSnapshot.tiebreakers
  );

  // Determine movement based on position
  const standings: BoxStanding[] = sortedPlayers.map((stats, index) => {
    const position = index + 1; // 1-based

    // Check if movement is frozen for this box
    const boxStatus = week.boxCompletionStatus.find(
      (s) => s.boxNumber === boxNumber
    );
    const movementFrozen =
      boxStatus?.movementFrozen ||
      boxStatus!.completedRounds < week.rulesSnapshot.minCompletedRoundsForMovement;

    // Determine movement
    let movement: BoxStanding['movement'];
    if (movementFrozen) {
      movement = 'frozen';
    } else if (position <= week.rulesSnapshot.promotionCount && boxNumber > 1) {
      movement = 'promotion';
    } else if (
      position > playerIds.length - week.rulesSnapshot.relegationCount &&
      boxNumber < week.boxAssignments.length
    ) {
      movement = 'relegation';
    } else {
      movement = 'stayed';
    }

    return {
      playerId: stats.playerId,
      playerName: stats.playerName,
      boxNumber,
      positionInBox: position,
      matchesPlayed: stats.matchesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      pointsFor: stats.pointsFor,
      pointsAgainst: stats.pointsAgainst,
      pointsDiff: stats.pointsDiff,
      movement,
      wasAbsent: stats.wasAbsent,
      substituteId: stats.substituteId,
    };
  });

  return standings;
}

/**
 * Process a match and update player stats
 */
function processMatchForStats(
  match: Match,
  playerStats: Map<string, PlayerStats>
): void {
  if (!match.winnerId || match.scores.length === 0) {
    return;
  }

  // Calculate total points for each side
  let totalPointsA = 0;
  let totalPointsB = 0;
  for (const game of match.scores) {
    totalPointsA += game.scoreA;
    totalPointsB += game.scoreB;
  }

  const sideAWon = match.winnerId === match.sideA.id;

  // Update Side A players
  for (let i = 0; i < match.sideA.playerIds.length; i++) {
    const playerId = match.sideA.playerIds[i];
    const stats = playerStats.get(playerId);
    if (stats) {
      stats.matchesPlayed++;
      stats.pointsFor += totalPointsA;
      stats.pointsAgainst += totalPointsB;
      if (sideAWon) {
        stats.wins++;
      } else {
        stats.losses++;
      }
      stats.playerName = match.sideA.playerNames?.[i] || stats.playerName || 'Unknown';

      // Track head-to-head
      for (const opponentId of match.sideB.playerIds) {
        stats.headToHead.set(opponentId, sideAWon ? 'win' : 'loss');
      }
    }
  }

  // Update Side B players
  for (let i = 0; i < match.sideB.playerIds.length; i++) {
    const playerId = match.sideB.playerIds[i];
    const stats = playerStats.get(playerId);
    if (stats) {
      stats.matchesPlayed++;
      stats.pointsFor += totalPointsB;
      stats.pointsAgainst += totalPointsA;
      if (!sideAWon) {
        stats.wins++;
      } else {
        stats.losses++;
      }
      stats.playerName = match.sideB.playerNames?.[i] || stats.playerName || 'Unknown';

      // Track head-to-head
      for (const opponentId of match.sideA.playerIds) {
        stats.headToHead.set(opponentId, sideAWon ? 'loss' : 'win');
      }
    }
  }
}

// ============================================
// TIEBREAKER SORTING
// ============================================

/**
 * Sort players by configurable tiebreaker order
 */
function sortByTiebreakers(
  players: PlayerStats[],
  tiebreakers: string[]
): PlayerStats[] {
  return [...players].sort((a, b) => {
    for (const tiebreaker of tiebreakers) {
      const result = compareTiebreaker(a, b, tiebreaker, players);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}

/**
 * Compare two players by a single tiebreaker
 *
 * Returns: negative if a < b, positive if a > b, 0 if equal
 * NOTE: We want HIGHER = BETTER, so we return b - a for most comparisons
 */
function compareTiebreaker(
  a: PlayerStats,
  b: PlayerStats,
  tiebreaker: string,
  _allPlayers: PlayerStats[]
): number {
  switch (tiebreaker) {
    case 'wins':
      return b.wins - a.wins; // More wins = better

    case 'head_to_head':
      // Only applies to exactly 2-way ties
      return compareHeadToHead(a, b);

    case 'points_diff':
      return b.pointsDiff - a.pointsDiff; // Higher diff = better

    case 'points_for':
      return b.pointsFor - a.pointsFor; // More points = better

    case 'points_against':
      return a.pointsAgainst - b.pointsAgainst; // Fewer points against = better

    default:
      return 0;
  }
}

/**
 * Compare two players by head-to-head result
 *
 * Only valid for exactly 2-way ties.
 * Returns 0 if they haven't played each other.
 */
function compareHeadToHead(a: PlayerStats, b: PlayerStats): number {
  const aVsB = a.headToHead.get(b.playerId);

  if (aVsB === 'win') {
    return -1; // a beat b, so a is better
  } else if (aVsB === 'loss') {
    return 1; // a lost to b, so b is better
  }

  return 0; // No head-to-head data
}

// ============================================
// STANDINGS SNAPSHOT
// ============================================

/**
 * Create a standings snapshot for storage
 */
export async function createStandingsSnapshot(
  week: BoxLeagueWeek,
  standings: BoxStanding[]
): Promise<BoxStandingsSnapshot> {
  // Find the latest match updatedAt
  let matchesUpdatedAtMax = 0;
  for (const boxAssignment of week.boxAssignments) {
    const matches = await getMatchesForBox(
      week.leagueId,
      week.weekNumber,
      boxAssignment.boxNumber
    );
    for (const match of matches) {
      if (match.updatedAt > matchesUpdatedAtMax) {
        matchesUpdatedAtMax = match.updatedAt;
      }
    }
  }

  return {
    weekNumber: week.weekNumber,
    calculatedAt: Date.now(),
    matchesUpdatedAtMax,
    sourceMatchCount: week.completedMatches,
    boxes: standings,
  };
}

/**
 * Check if standings snapshot is stale
 *
 * Returns true if any match has been updated since snapshot was created
 */
export async function isStandingsStale(
  leagueId: string,
  weekNumber: number,
  snapshot: BoxStandingsSnapshot
): Promise<boolean> {
  // Quick check: if calculated recently, probably not stale
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (snapshot.calculatedAt > fiveMinutesAgo) {
    return false;
  }

  // Check if any match has been updated since snapshot
  const { getMatchesForWeek } = await import('./boxLeagueMatchFactory');
  const matches = await getMatchesForWeek(leagueId, weekNumber);

  for (const match of matches) {
    if (match.updatedAt > snapshot.matchesUpdatedAtMax) {
      return true;
    }
  }

  return false;
}

// ============================================
// STANDINGS DISPLAY
// ============================================

/**
 * Format standings for display as a table
 */
export function formatStandingsTable(
  standings: BoxStanding[],
  boxNumber: number
): string {
  const boxStandings = standings
    .filter((s) => s.boxNumber === boxNumber)
    .sort((a, b) => a.positionInBox - b.positionInBox);

  if (boxStandings.length === 0) {
    return 'No standings available';
  }

  let table = 'Pos | Player | W | L | +/- | For | Against | Movement\n';
  table += '----|--------|---|---|-----|-----|---------|----------\n';

  for (const standing of boxStandings) {
    const movementIcon =
      standing.movement === 'promotion'
        ? '↑'
        : standing.movement === 'relegation'
        ? '↓'
        : standing.movement === 'frozen'
        ? '🔒'
        : '-';

    table += `${standing.positionInBox} | ${standing.playerName} | ${standing.wins} | ${standing.losses} | ${standing.pointsDiff} | ${standing.pointsFor} | ${standing.pointsAgainst} | ${movementIcon}\n`;
  }

  return table;
}

/**
 * Get standings for a single player
 */
export function getPlayerStanding(
  standings: BoxStanding[],
  playerId: string
): BoxStanding | undefined {
  return standings.find((s) => s.playerId === playerId);
}

/**
 * Get promotion candidates from standings
 */
export function getPromotionCandidates(standings: BoxStanding[]): BoxStanding[] {
  return standings.filter((s) => s.movement === 'promotion');
}

/**
 * Get relegation candidates from standings
 */
export function getRelegationCandidates(standings: BoxStanding[]): BoxStanding[] {
  return standings.filter((s) => s.movement === 'relegation');
}
