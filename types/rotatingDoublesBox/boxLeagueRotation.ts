/**
 * Box League Rotation Patterns
 *
 * Pure functions for generating rotation patterns.
 * No Firebase dependencies - fully testable.
 *
 * FILE LOCATION: types/rotatingDoublesBox/boxLeagueRotation.ts
 * VERSION: V07.25
 */

import type {
  RotationPattern,
  GeneratedPairing,
  PatternValidationResult,
} from './boxLeagueTypes';

// ============================================
// 4-PLAYER BOX ROTATION
// ============================================

/**
 * 4-Player Box Pattern
 *
 * 3 rounds, 3 matches, no byes
 * Each player: 3 matches, 0 byes
 * Each player partners with every other player once
 *
 * Round 1: [0,1] vs [2,3]    (A+B vs C+D)
 * Round 2: [0,2] vs [1,3]    (A+C vs B+D)
 * Round 3: [0,3] vs [1,2]    (A+D vs B+C)
 */
const FOUR_PLAYER_PATTERN: RotationPattern = {
  boxSize: 4,
  totalRounds: 3,
  matchesPerPlayer: 3,
  byesPerPlayer: 0,
  rounds: [
    { roundNumber: 1, teamA: [0, 1], teamB: [2, 3] },
    { roundNumber: 2, teamA: [0, 2], teamB: [1, 3] },
    { roundNumber: 3, teamA: [0, 3], teamB: [1, 2] },
  ],
};

// ============================================
// 5-PLAYER BOX ROTATION (DEFAULT)
// ============================================

/**
 * 5-Player Box Pattern
 *
 * 5 rounds, 5 matches total, 1 bye each
 * Each player: 4 matches, 1 bye
 * Bye rotates fairly through all 5 players
 *
 * Round 1: [0,1] vs [2,3], bye: 4    (A+B vs C+D, E bye)
 * Round 2: [0,2] vs [3,4], bye: 1    (A+C vs D+E, B bye)
 * Round 3: [0,3] vs [1,4], bye: 2    (A+D vs B+E, C bye)
 * Round 4: [0,4] vs [1,2], bye: 3    (A+E vs B+C, D bye)
 * Round 5: [1,3] vs [2,4], bye: 0    (B+D vs C+E, A bye)
 */
const FIVE_PLAYER_PATTERN: RotationPattern = {
  boxSize: 5,
  totalRounds: 5,
  matchesPerPlayer: 4,
  byesPerPlayer: 1,
  rounds: [
    { roundNumber: 1, teamA: [0, 1], teamB: [2, 3], byePlayerIndex: 4 },
    { roundNumber: 2, teamA: [0, 2], teamB: [3, 4], byePlayerIndex: 1 },
    { roundNumber: 3, teamA: [0, 3], teamB: [1, 4], byePlayerIndex: 2 },
    { roundNumber: 4, teamA: [0, 4], teamB: [1, 2], byePlayerIndex: 3 },
    { roundNumber: 5, teamA: [1, 3], teamB: [2, 4], byePlayerIndex: 0 },
  ],
};

// ============================================
// 6-PLAYER BOX ROTATION
// ============================================

/**
 * 6-Player Box Pattern
 *
 * 6 rounds, 6 matches total, 2 rest per round
 * Each player: 4 matches, 2 rests
 * 1 court per box (v1 assumption)
 *
 * Round 1: [0,1] vs [2,3], rest: 4,5
 * Round 2: [4,5] vs [0,2], rest: 1,3
 * Round 3: [1,3] vs [4,0], rest: 2,5
 * Round 4: [2,5] vs [1,4], rest: 0,3
 * Round 5: [0,3] vs [2,4], rest: 1,5
 * Round 6: [1,5] vs [3,0], rest: 2,4
 */
const SIX_PLAYER_PATTERN: RotationPattern = {
  boxSize: 6,
  totalRounds: 6,
  matchesPerPlayer: 4,
  byesPerPlayer: 2,
  rounds: [
    { roundNumber: 1, teamA: [0, 1], teamB: [2, 3], restingPlayerIndices: [4, 5] },
    { roundNumber: 2, teamA: [4, 5], teamB: [0, 2], restingPlayerIndices: [1, 3] },
    { roundNumber: 3, teamA: [1, 3], teamB: [4, 0], restingPlayerIndices: [2, 5] },
    { roundNumber: 4, teamA: [2, 5], teamB: [1, 4], restingPlayerIndices: [0, 3] },
    { roundNumber: 5, teamA: [0, 3], teamB: [2, 4], restingPlayerIndices: [1, 5] },
    { roundNumber: 6, teamA: [1, 5], teamB: [3, 0], restingPlayerIndices: [2, 4] },
  ],
};

// ============================================
// PATTERN ACCESS FUNCTIONS
// ============================================

/**
 * Get the rotation pattern for a given box size
 */
export function getRotationPattern(boxSize: 4 | 5 | 6): RotationPattern {
  switch (boxSize) {
    case 4:
      return FOUR_PLAYER_PATTERN;
    case 5:
      return FIVE_PLAYER_PATTERN;
    case 6:
      return SIX_PLAYER_PATTERN;
  }
}

/**
 * Get rounds where a specific player has a bye
 */
export function getByeRounds(playerIndex: number, boxSize: 5 | 6): number[] {
  const pattern = getRotationPattern(boxSize);
  const byeRounds: number[] = [];

  for (const round of pattern.rounds) {
    if (boxSize === 5 && round.byePlayerIndex === playerIndex) {
      byeRounds.push(round.roundNumber);
    } else if (boxSize === 6 && round.restingPlayerIndices?.includes(playerIndex)) {
      byeRounds.push(round.roundNumber);
    }
  }

  return byeRounds;
}

// ============================================
// PAIRING GENERATION
// ============================================

/**
 * Player info for generating pairings
 */
export interface PlayerInfo {
  id: string;
  name: string;
}

/**
 * Generate box pairings with actual player IDs
 *
 * @param players - Array of players (ordered by position in box)
 * @param boxSize - Size of the box (must match players.length)
 * @returns Array of generated pairings for each round
 */
export function generateBoxPairings(
  players: PlayerInfo[],
  boxSize: 4 | 5 | 6
): GeneratedPairing[] {
  if (players.length !== boxSize) {
    throw new Error(
      `Player count (${players.length}) must match box size (${boxSize})`
    );
  }

  const pattern = getRotationPattern(boxSize);
  const pairings: GeneratedPairing[] = [];

  for (const round of pattern.rounds) {
    const pairing: GeneratedPairing = {
      roundNumber: round.roundNumber,
      teamAPlayerIds: [
        players[round.teamA[0]].id,
        players[round.teamA[1]].id,
      ],
      teamAPlayerNames: [
        players[round.teamA[0]].name,
        players[round.teamA[1]].name,
      ],
      teamBPlayerIds: [
        players[round.teamB[0]].id,
        players[round.teamB[1]].id,
      ],
      teamBPlayerNames: [
        players[round.teamB[0]].name,
        players[round.teamB[1]].name,
      ],
    };

    // Add bye player for 5-player boxes
    if (round.byePlayerIndex !== undefined) {
      pairing.byePlayerId = players[round.byePlayerIndex].id;
      pairing.byePlayerName = players[round.byePlayerIndex].name;
    }

    // Add resting players for 6-player boxes
    if (round.restingPlayerIndices && round.restingPlayerIndices.length > 0) {
      pairing.restingPlayerIds = round.restingPlayerIndices.map(
        (idx) => players[idx].id
      );
    }

    pairings.push(pairing);
  }

  return pairings;
}

// ============================================
// PATTERN VALIDATION
// ============================================

/**
 * Validate that a rotation pattern is fair
 *
 * Checks:
 * - Each player plays the correct number of matches
 * - Each player rests the correct number of times
 * - Partner distribution is balanced (best effort)
 * - Opponent distribution is balanced (best effort)
 */
export function validatePatternFairness(
  pattern: RotationPattern
): PatternValidationResult {
  const { boxSize, matchesPerPlayer, byesPerPlayer, rounds } = pattern;
  const warnings: string[] = [];

  // Track stats for each player
  const playerStats: {
    matchCount: number;
    byeCount: number;
    partners: Set<number>;
    opponents: Set<number>;
  }[] = [];

  for (let i = 0; i < boxSize; i++) {
    playerStats.push({
      matchCount: 0,
      byeCount: 0,
      partners: new Set(),
      opponents: new Set(),
    });
  }

  // Analyze each round
  for (const round of rounds) {
    const { teamA, teamB, byePlayerIndex, restingPlayerIndices } = round;

    // Count matches and track partners/opponents
    for (const playerIdx of teamA) {
      playerStats[playerIdx].matchCount++;
      playerStats[playerIdx].partners.add(teamA[0] === playerIdx ? teamA[1] : teamA[0]);
      playerStats[playerIdx].opponents.add(teamB[0]);
      playerStats[playerIdx].opponents.add(teamB[1]);
    }

    for (const playerIdx of teamB) {
      playerStats[playerIdx].matchCount++;
      playerStats[playerIdx].partners.add(teamB[0] === playerIdx ? teamB[1] : teamB[0]);
      playerStats[playerIdx].opponents.add(teamA[0]);
      playerStats[playerIdx].opponents.add(teamA[1]);
    }

    // Count byes
    if (byePlayerIndex !== undefined) {
      playerStats[byePlayerIndex].byeCount++;
    }

    if (restingPlayerIndices) {
      for (const idx of restingPlayerIndices) {
        playerStats[idx].byeCount++;
      }
    }
  }

  // Validate match count
  const eachPlayerPlaysCorrectMatches = playerStats.every(
    (s) => s.matchCount === matchesPerPlayer
  );

  if (!eachPlayerPlaysCorrectMatches) {
    const mismatches = playerStats
      .map((s, i) => ({ player: i, matches: s.matchCount }))
      .filter((s) => s.matches !== matchesPerPlayer);
    return {
      valid: false,
      error: `Players have incorrect match counts: ${JSON.stringify(mismatches)}`,
      checks: {
        eachPlayerPlaysCorrectMatches: false,
        eachPlayerRestsCorrectTimes: false,
        partnerDistributionBalanced: false,
        opponentDistributionBalanced: false,
      },
    };
  }

  // Validate bye count
  const eachPlayerRestsCorrectTimes = playerStats.every(
    (s) => s.byeCount === byesPerPlayer
  );

  if (!eachPlayerRestsCorrectTimes) {
    const mismatches = playerStats
      .map((s, i) => ({ player: i, byes: s.byeCount }))
      .filter((s) => s.byes !== byesPerPlayer);
    return {
      valid: false,
      error: `Players have incorrect bye counts: ${JSON.stringify(mismatches)}`,
      checks: {
        eachPlayerPlaysCorrectMatches: true,
        eachPlayerRestsCorrectTimes: false,
        partnerDistributionBalanced: false,
        opponentDistributionBalanced: false,
      },
    };
  }

  // Check partner distribution (best effort)
  const expectedPartners = boxSize === 4 ? 3 : boxSize === 5 ? 4 : 4;
  const partnerDistributionBalanced = playerStats.every(
    (s) => s.partners.size >= expectedPartners - 1
  );

  if (!partnerDistributionBalanced) {
    warnings.push('Partner distribution is not perfectly balanced');
  }

  // Check opponent distribution (best effort)
  const opponentDistributionBalanced = playerStats.every(
    (s) => s.opponents.size >= boxSize - 2
  );

  if (!opponentDistributionBalanced) {
    warnings.push('Opponent distribution is not perfectly balanced');
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    checks: {
      eachPlayerPlaysCorrectMatches,
      eachPlayerRestsCorrectTimes,
      partnerDistributionBalanced,
      opponentDistributionBalanced,
    },
  };
}

// ============================================
// ROUND COUNT HELPERS
// ============================================

/**
 * Get the number of rounds for a box size
 */
export function getRoundCount(boxSize: 4 | 5 | 6): number {
  const pattern = getRotationPattern(boxSize);
  return pattern.totalRounds;
}

/**
 * Get matches per player for a box size
 */
export function getMatchesPerPlayer(boxSize: 4 | 5 | 6): number {
  const pattern = getRotationPattern(boxSize);
  return pattern.matchesPerPlayer;
}

/**
 * Get byes per player for a box size
 */
export function getByesPerPlayer(boxSize: 4 | 5 | 6): number {
  const pattern = getRotationPattern(boxSize);
  return pattern.byesPerPlayer;
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format a pairing for display
 *
 * @example "Alice + Bob vs Carol + Dan (Eve has bye)"
 */
export function formatPairingForDisplay(pairing: GeneratedPairing): string {
  const teamA = pairing.teamAPlayerNames?.join(' + ') || 'Team A';
  const teamB = pairing.teamBPlayerNames?.join(' + ') || 'Team B';

  let display = `${teamA} vs ${teamB}`;

  if (pairing.byePlayerName) {
    display += ` (${pairing.byePlayerName} has bye)`;
  }

  return display;
}

/**
 * Get round-by-round schedule for display
 */
export function getScheduleDisplay(
  players: PlayerInfo[],
  boxSize: 4 | 5 | 6
): { roundNumber: number; matchup: string; bye?: string }[] {
  const pairings = generateBoxPairings(players, boxSize);

  return pairings.map((p) => ({
    roundNumber: p.roundNumber,
    matchup: `${p.teamAPlayerNames?.join(' + ')} vs ${p.teamBPlayerNames?.join(' + ')}`,
    bye: p.byePlayerName,
  }));
}
