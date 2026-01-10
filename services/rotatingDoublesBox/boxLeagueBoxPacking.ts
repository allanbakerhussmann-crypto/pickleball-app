/**
 * Box League Box Packing Algorithm
 *
 * Calculates optimal box sizes for any roster count.
 * Allowed box sizes: 4, 5, or 6 only (3-player boxes don't work for rotating doubles)
 *
 * Priority: Prefer 5s, then 4s, avoid 6s unless necessary
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueBoxPacking.ts
 * VERSION: V07.25
 */

// ============================================
// TYPES
// ============================================

/**
 * Result of box packing calculation
 */
export interface BoxPackingResult {
  /** Whether packing is possible */
  success: boolean;

  /** Array of box sizes (e.g., [5, 5, 4]) */
  boxSizes: number[];

  /** Total number of boxes */
  boxCount: number;

  /** Distribution summary */
  distribution: {
    fives: number;
    fours: number;
    sixes: number;
  };

  /** Error message if packing failed */
  error?: string;
}

/**
 * Box assignment with player distribution
 */
export interface BoxDistribution {
  /** Box number (1-based) */
  boxNumber: number;

  /** Box size */
  boxSize: 4 | 5 | 6;

  /** Player IDs assigned to this box (ordered by position) */
  playerIds: string[];
}

// ============================================
// CORE ALGORITHM
// ============================================

/**
 * Pack players into boxes of size 4, 5, or 6
 *
 * Algorithm priority:
 * 1. Maximize boxes of 5 (ideal size)
 * 2. Fill remainder with 4s
 * 3. Use 6s only when necessary
 *
 * @param playerCount - Total number of players
 * @returns BoxPackingResult with box sizes or error
 */
export function packPlayersIntoBoxes(playerCount: number): BoxPackingResult {
  // Minimum 4 players required
  if (playerCount < 4) {
    return {
      success: false,
      boxSizes: [],
      boxCount: 0,
      distribution: { fives: 0, fours: 0, sixes: 0 },
      error: `Cannot create boxes with only ${playerCount} players. Minimum is 4.`,
    };
  }

  // Try combinations prioritizing 5s
  for (let fives = Math.floor(playerCount / 5); fives >= 0; fives--) {
    const remaining = playerCount - fives * 5;

    // Try to fill remaining with 4s and 6s
    for (let fours = Math.floor(remaining / 4); fours >= 0; fours--) {
      const leftover = remaining - fours * 4;

      if (leftover >= 0 && leftover % 6 === 0) {
        const sixes = leftover / 6;

        // Build the result array
        const boxSizes: number[] = [
          ...Array(fives).fill(5),
          ...Array(fours).fill(4),
          ...Array(sixes).fill(6),
        ];

        return {
          success: true,
          boxSizes,
          boxCount: boxSizes.length,
          distribution: { fives, fours, sixes },
        };
      }
    }
  }

  // If we get here, packing is impossible
  return {
    success: false,
    boxSizes: [],
    boxCount: 0,
    distribution: { fives: 0, fours: 0, sixes: 0 },
    error: `Cannot create valid boxes with ${playerCount} players. Try adding or removing players.`,
  };
}

// ============================================
// PLAYER DISTRIBUTION
// ============================================

/**
 * Distribute players into boxes based on packing result
 *
 * Players are assigned in order (highest rated first typically).
 * Box 1 gets the top players, Box 2 gets the next tier, etc.
 *
 * @param playerIds - Ordered array of player IDs (by DUPR rating, highest first)
 * @param packing - Box packing result from packPlayersIntoBoxes
 * @returns Array of box distributions
 */
export function distributePlayersToBoxes(
  playerIds: string[],
  packing: BoxPackingResult
): BoxDistribution[] {
  if (!packing.success) {
    throw new Error(packing.error || 'Invalid packing result');
  }

  if (playerIds.length !== packing.boxSizes.reduce((a, b) => a + b, 0)) {
    throw new Error(
      `Player count (${playerIds.length}) doesn't match packing total (${packing.boxSizes.reduce((a, b) => a + b, 0)})`
    );
  }

  const distributions: BoxDistribution[] = [];
  let playerIndex = 0;

  for (let boxNum = 0; boxNum < packing.boxSizes.length; boxNum++) {
    const boxSize = packing.boxSizes[boxNum] as 4 | 5 | 6;
    const boxPlayerIds = playerIds.slice(playerIndex, playerIndex + boxSize);

    distributions.push({
      boxNumber: boxNum + 1, // 1-based box numbers
      boxSize,
      playerIds: boxPlayerIds,
    });

    playerIndex += boxSize;
  }

  return distributions;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if a player count can be packed into valid boxes
 */
export function canPackPlayers(playerCount: number): boolean {
  return packPlayersIntoBoxes(playerCount).success;
}

/**
 * Get valid player counts in a range
 *
 * Useful for showing organizers valid roster sizes
 *
 * @param min - Minimum player count to check
 * @param max - Maximum player count to check
 * @returns Array of valid player counts
 */
export function getValidPlayerCounts(min: number, max: number): number[] {
  const valid: number[] = [];
  for (let count = Math.max(4, min); count <= max; count++) {
    if (canPackPlayers(count)) {
      valid.push(count);
    }
  }
  return valid;
}

/**
 * Get invalid player counts in a range
 *
 * Useful for warning organizers about problematic roster sizes
 *
 * @param min - Minimum player count to check
 * @param max - Maximum player count to check
 * @returns Array of invalid player counts
 */
export function getInvalidPlayerCounts(min: number, max: number): number[] {
  const invalid: number[] = [];
  for (let count = Math.max(4, min); count <= max; count++) {
    if (!canPackPlayers(count)) {
      invalid.push(count);
    }
  }
  return invalid;
}

// ============================================
// ADJUSTMENT SUGGESTIONS
// ============================================

/**
 * Suggestion for fixing invalid player count
 */
export interface PackingAdjustmentSuggestion {
  /** Type of adjustment */
  type: 'add' | 'remove';

  /** Number of players to add/remove */
  count: number;

  /** Resulting player count */
  resultingCount: number;

  /** Box packing for that count */
  packing: BoxPackingResult;
}

/**
 * Get suggestions for fixing an invalid player count
 *
 * @param playerCount - Current (invalid) player count
 * @returns Array of suggestions (add or remove players)
 */
export function getPackingAdjustmentSuggestions(
  playerCount: number
): PackingAdjustmentSuggestion[] {
  const packing = packPlayersIntoBoxes(playerCount);

  if (packing.success) {
    return []; // No adjustment needed
  }

  const suggestions: PackingAdjustmentSuggestion[] = [];

  // Try adding 1-3 players
  for (let add = 1; add <= 3; add++) {
    const newCount = playerCount + add;
    const newPacking = packPlayersIntoBoxes(newCount);
    if (newPacking.success) {
      suggestions.push({
        type: 'add',
        count: add,
        resultingCount: newCount,
        packing: newPacking,
      });
      break; // Only suggest smallest addition
    }
  }

  // Try removing 1-3 players (if we have enough)
  for (let remove = 1; remove <= 3 && playerCount - remove >= 4; remove++) {
    const newCount = playerCount - remove;
    const newPacking = packPlayersIntoBoxes(newCount);
    if (newPacking.success) {
      suggestions.push({
        type: 'remove',
        count: remove,
        resultingCount: newCount,
        packing: newPacking,
      });
      break; // Only suggest smallest removal
    }
  }

  return suggestions;
}

// ============================================
// REBALANCING
// ============================================

/**
 * Check if boxes need rebalancing after player movement
 *
 * This happens when promotion/relegation creates uneven boxes
 *
 * @param currentBoxSizes - Current box sizes after movement
 * @returns Whether rebalancing is needed and suggestions
 */
export function checkRebalanceNeeded(
  currentBoxSizes: number[]
): {
  needsRebalance: boolean;
  currentDistribution: { fours: number; fives: number; sixes: number };
  suggestion?: string;
} {
  const totalPlayers = currentBoxSizes.reduce((a, b) => a + b, 0);
  const idealPacking = packPlayersIntoBoxes(totalPlayers);

  if (!idealPacking.success) {
    return {
      needsRebalance: true,
      currentDistribution: countBoxSizes(currentBoxSizes),
      suggestion: `Player count ${totalPlayers} cannot form valid boxes. Add or remove players.`,
    };
  }

  // Compare current to ideal
  const currentDist = countBoxSizes(currentBoxSizes);
  const idealDist = idealPacking.distribution;

  const needsRebalance =
    currentDist.fours !== idealDist.fours ||
    currentDist.fives !== idealDist.fives ||
    currentDist.sixes !== idealDist.sixes;

  if (needsRebalance) {
    return {
      needsRebalance: true,
      currentDistribution: currentDist,
      suggestion: `Rebalance to ${idealPacking.distribution.fives} boxes of 5, ${idealPacking.distribution.fours} boxes of 4, ${idealPacking.distribution.sixes} boxes of 6.`,
    };
  }

  return {
    needsRebalance: false,
    currentDistribution: currentDist,
  };
}

/**
 * Count box sizes in a distribution
 */
function countBoxSizes(boxSizes: number[]): {
  fours: number;
  fives: number;
  sixes: number;
} {
  return {
    fours: boxSizes.filter((s) => s === 4).length,
    fives: boxSizes.filter((s) => s === 5).length,
    sixes: boxSizes.filter((s) => s === 6).length,
  };
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format box packing for display
 *
 * @example "3 boxes of 5, 1 box of 4 (19 players)"
 */
export function formatPackingForDisplay(packing: BoxPackingResult): string {
  if (!packing.success) {
    return packing.error || 'Invalid packing';
  }

  const parts: string[] = [];
  const { fives, fours, sixes } = packing.distribution;

  if (fives > 0) {
    parts.push(`${fives} ${fives === 1 ? 'box' : 'boxes'} of 5`);
  }
  if (fours > 0) {
    parts.push(`${fours} ${fours === 1 ? 'box' : 'boxes'} of 4`);
  }
  if (sixes > 0) {
    parts.push(`${sixes} ${sixes === 1 ? 'box' : 'boxes'} of 6`);
  }

  const total = packing.boxSizes.reduce((a, b) => a + b, 0);
  return `${parts.join(', ')} (${total} players)`;
}

// ============================================
// PACKING EXAMPLES TABLE
// ============================================

/**
 * Reference table of packing examples
 * (from the architecture plan)
 *
 * | Players | Box Sizes        | Notes                    |
 * |---------|------------------|--------------------------|
 * | 10      | 5 + 5            | Perfect                  |
 * | 13      | 5 + 4 + 4        | Works                    |
 * | 14      | 5 + 5 + 4        | Works                    |
 * | 15      | 5 + 5 + 5        | Perfect                  |
 * | 16      | 5 + 5 + 6        | Works (or 4 + 4 + 4 + 4) |
 * | 17      | 5 + 4 + 4 + 4    | Works                    |
 * | 11      | 5 + 6            | Works                    |
 * | 7       | IMPOSSIBLE       | Can't make valid boxes   |
 * | 3       | IMPOSSIBLE       | Too few players          |
 */
