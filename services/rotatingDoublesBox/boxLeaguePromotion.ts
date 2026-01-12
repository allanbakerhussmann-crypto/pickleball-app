/**
 * Box League Promotion Service
 *
 * Handles promotion/relegation logic and edge cases.
 * Generates next week's box assignments based on standings.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeaguePromotion.ts
 * VERSION: V07.42
 */

import type {
  BoxLeagueWeek,
  BoxStanding,
  BoxAssignment,
  PlayerMovement,
} from '../../types/rotatingDoublesBox';

// ============================================
// MOVEMENT CALCULATION
// ============================================

/**
 * Apply movements based on standings
 *
 * @param week - Current week with rules
 * @param standings - Calculated standings
 * @returns Array of player movements
 */
export function applyMovements(
  week: BoxLeagueWeek,
  standings: BoxStanding[]
): PlayerMovement[] {
  const movements: PlayerMovement[] = [];

  // Group standings by box
  const boxStandingsMap = new Map<number, BoxStanding[]>();
  for (const standing of standings) {
    const box = boxStandingsMap.get(standing.boxNumber) || [];
    box.push(standing);
    boxStandingsMap.set(standing.boxNumber, box);
  }

  // Sort each box by position
  for (const [_boxNumber, boxStandings] of boxStandingsMap) {
    boxStandings.sort((a, b) => a.positionInBox - b.positionInBox);
  }

  const totalBoxes = week.boxAssignments.length;

  // Process each player
  for (const standing of standings) {
    const boxSize = boxStandingsMap.get(standing.boxNumber)!.length;
    const movement = calculatePlayerMovement(
      standing,
      week,
      boxSize,
      totalBoxes
    );

    movements.push(movement);
  }

  return movements;
}

/**
 * Calculate movement for a single player
 *
 * V07.42: IMPORTANT - We calculate movement based on POSITION, not the pre-calculated
 * standing.movement field. The standing.movement is for DISPLAY purposes only.
 * Actual promotion/relegation is determined by position in box.
 */
function calculatePlayerMovement(
  standing: BoxStanding,
  week: BoxLeagueWeek,
  boxSize: number,
  totalBoxes: number
): PlayerMovement {
  // V07.26: Add defaults in case rulesSnapshot values are undefined
  const promotionCount = week.rulesSnapshot?.promotionCount ?? 1;
  const relegationCount = week.rulesSnapshot?.relegationCount ?? 1;


  // V07.42: REMOVED the check for standing.movement === 'frozen'
  // The standing.movement field is for UI display, not for determining actual movements.
  // Actual movements are calculated based on position in box below.

  // Check for promotion (top N in box, not in box 1)
  const isPromotionPosition = standing.positionInBox <= promotionCount;
  const canPromote = standing.boxNumber > 1;

  if (isPromotionPosition && canPromote) {
    return {
      playerId: standing.playerId,
      playerName: standing.playerName,
      fromBox: standing.boxNumber,
      toBox: standing.boxNumber - 1,
      fromPosition: standing.positionInBox,
      toPosition: boxSize - promotionCount + standing.positionInBox, // Go to bottom of higher box
      reason: 'promotion',
      wasAbsent: standing.wasAbsent,
    };
  }

  // Check for relegation (bottom N in box, not in last box)
  const relegationThreshold = boxSize - relegationCount;
  const isRelegationPosition = standing.positionInBox > relegationThreshold;
  const canRelegate = standing.boxNumber < totalBoxes;

  if (isRelegationPosition && canRelegate) {
    const relegationPosition = standing.positionInBox - relegationThreshold;
    return {
      playerId: standing.playerId,
      playerName: standing.playerName,
      fromBox: standing.boxNumber,
      toBox: standing.boxNumber + 1,
      fromPosition: standing.positionInBox,
      toPosition: relegationPosition, // Go to top of lower box
      reason: 'relegation',
      wasAbsent: standing.wasAbsent,
    };
  }

  // No movement - stay in place
  return {
    playerId: standing.playerId,
    playerName: standing.playerName,
    fromBox: standing.boxNumber,
    toBox: standing.boxNumber,
    fromPosition: standing.positionInBox,
    toPosition: standing.positionInBox,
    reason: 'stayed',
    wasAbsent: standing.wasAbsent,
  };
}

// ============================================
// NEXT WEEK GENERATION
// ============================================

/**
 * Generate next week's box assignments based on movements
 */
export function generateNextWeekAssignments(
  currentAssignments: BoxAssignment[],
  movements: PlayerMovement[]
): BoxAssignment[] {

  // Group movements by destination box
  const boxPlayersMap = new Map<number, { playerId: string; position: number; playerName?: string }[]>();

  // Initialize all boxes
  for (const assignment of currentAssignments) {
    boxPlayersMap.set(assignment.boxNumber, []);
  }

  // Place players based on movements
  for (const movement of movements) {
    const boxPlayers = boxPlayersMap.get(movement.toBox) || [];
    boxPlayers.push({
      playerId: movement.playerId,
      playerName: movement.playerName,
      position: movement.toPosition,
    });
    boxPlayersMap.set(movement.toBox, boxPlayers);
  }


  // Build new assignments with players sorted by position
  const newAssignments: BoxAssignment[] = [];

  for (const [boxNumber, players] of boxPlayersMap) {
    // Sort by position
    players.sort((a, b) => a.position - b.position);

    newAssignments.push({
      boxNumber,
      playerIds: players.map((p) => p.playerId),
    });
  }

  // Sort assignments by box number
  newAssignments.sort((a, b) => a.boxNumber - b.boxNumber);


  return newAssignments;
}

// ============================================
// EDGE CASES
// ============================================

/**
 * Handle absent player at top of box
 *
 * Based on settings:
 * - If movementFrozenIfAbsent: player stays in place
 * - If autoRelegateOnAbsence: player relegates regardless
 * - Otherwise: use standings position
 */
export function handleAbsentPlayerMovement(
  standing: BoxStanding,
  week: BoxLeagueWeek,
  settings: {
    movementFrozenIfAbsent?: boolean;
    autoRelegateOnAbsence?: boolean;
  }
): PlayerMovement {
  if (!standing.wasAbsent) {
    throw new Error('Player is not marked as absent');
  }

  // Freeze if setting enabled
  if (settings.movementFrozenIfAbsent) {
    return {
      playerId: standing.playerId,
      playerName: standing.playerName,
      fromBox: standing.boxNumber,
      toBox: standing.boxNumber,
      fromPosition: standing.positionInBox,
      toPosition: standing.positionInBox,
      reason: 'frozen',
      wasAbsent: true,
      absencePolicy: 'movement_frozen',
    };
  }

  // Auto-relegate if setting enabled
  if (settings.autoRelegateOnAbsence && standing.boxNumber < week.boxAssignments.length) {
    return {
      playerId: standing.playerId,
      playerName: standing.playerName,
      fromBox: standing.boxNumber,
      toBox: standing.boxNumber + 1,
      fromPosition: standing.positionInBox,
      toPosition: 1, // Top of lower box
      reason: 'relegation',
      wasAbsent: true,
      absencePolicy: 'auto_relegate',
    };
  }

  // Otherwise use normal movement based on standings
  return calculatePlayerMovement(
    standing,
    week,
    week.boxAssignments.find((b) => b.boxNumber === standing.boxNumber)?.playerIds.length || 5,
    week.boxAssignments.length
  );
}

/**
 * Handle new joiner placement
 */
export function getNewJoinerPlacement(
  totalBoxes: number,
  boxSizes: number[],
  newPlayerPolicy: {
    entryBox: 'bottom' | 'rating_based';
    entryPosition: 'bottom' | 'top';
  },
  duprRating?: number,
  existingRatings?: { boxNumber: number; avgRating: number }[]
): { boxNumber: number; position: number } {
  let targetBox: number;

  if (newPlayerPolicy.entryBox === 'rating_based' && duprRating && existingRatings) {
    // Find appropriate box based on rating
    targetBox = findBoxByRating(duprRating, existingRatings);
  } else {
    // Default: bottom box
    targetBox = totalBoxes;
  }

  // Determine position within box
  const boxSize = boxSizes[targetBox - 1] || 5;
  const position = newPlayerPolicy.entryPosition === 'top' ? 1 : boxSize + 1;

  return { boxNumber: targetBox, position };
}

/**
 * Find appropriate box based on DUPR rating
 */
function findBoxByRating(
  duprRating: number,
  boxRatings: { boxNumber: number; avgRating: number }[]
): number {
  // Sort boxes by rating (highest first = Box 1)
  const sorted = [...boxRatings].sort((a, b) => b.avgRating - a.avgRating);

  // Find the first box where player's rating is >= average
  for (const box of sorted) {
    if (duprRating >= box.avgRating) {
      return box.boxNumber;
    }
  }

  // If rating is lower than all boxes, go to bottom box
  return sorted[sorted.length - 1]?.boxNumber || 1;
}

/**
 * Handle withdrawn player
 *
 * Removes player from assignments without affecting others' positions
 */
export function removeWithdrawnPlayer(
  assignments: BoxAssignment[],
  playerId: string
): BoxAssignment[] {
  return assignments.map((assignment) => ({
    ...assignment,
    playerIds: assignment.playerIds.filter((id) => id !== playerId),
  }));
}

// ============================================
// REBALANCING
// ============================================

/**
 * Check if boxes need rebalancing after movements
 *
 * Returns true if any box has an invalid size
 */
export function needsRebalancing(assignments: BoxAssignment[]): boolean {
  for (const assignment of assignments) {
    const size = assignment.playerIds.length;
    if (size < 4 || size > 6) {
      return true;
    }
  }
  return false;
}

/**
 * Suggest rebalancing moves
 *
 * Returns suggested player moves to balance boxes
 */
export function suggestRebalancing(
  assignments: BoxAssignment[]
): { from: { boxNumber: number; playerId: string }; to: number }[] {
  const suggestions: { from: { boxNumber: number; playerId: string }; to: number }[] = [];

  // Find overfull and underfull boxes
  const overfull = assignments.filter((a) => a.playerIds.length > 6);
  const underfull = assignments.filter((a) => a.playerIds.length < 4);

  // Move from overfull to underfull
  for (const over of overfull) {
    while (over.playerIds.length > 6 && underfull.length > 0) {
      const under = underfull[0];

      // Move bottom player from overfull to top of underfull
      const playerToMove = over.playerIds[over.playerIds.length - 1];
      suggestions.push({
        from: { boxNumber: over.boxNumber, playerId: playerToMove },
        to: under.boxNumber,
      });

      // Update virtual state
      over.playerIds.pop();
      under.playerIds.unshift(playerToMove);

      if (under.playerIds.length >= 4) {
        underfull.shift();
      }
    }
  }

  return suggestions;
}

// ============================================
// MOVEMENT DISPLAY
// ============================================

/**
 * Format movements for display
 */
export function formatMovementsForDisplay(movements: PlayerMovement[]): string {
  const lines: string[] = [];

  // Group by movement type
  const promotions = movements.filter((m) => m.reason === 'promotion');
  const relegations = movements.filter((m) => m.reason === 'relegation');
  const frozen = movements.filter((m) => m.reason === 'frozen');

  if (promotions.length > 0) {
    lines.push('↑ Promotions:');
    for (const m of promotions) {
      lines.push(`  ${m.playerName}: Box ${m.fromBox} → Box ${m.toBox}`);
    }
  }

  if (relegations.length > 0) {
    lines.push('↓ Relegations:');
    for (const m of relegations) {
      lines.push(`  ${m.playerName}: Box ${m.fromBox} → Box ${m.toBox}`);
    }
  }

  if (frozen.length > 0) {
    lines.push('🔒 Movement Frozen:');
    for (const m of frozen) {
      lines.push(`  ${m.playerName}: Stays in Box ${m.fromBox}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get movement summary counts
 */
export function getMovementSummary(movements: PlayerMovement[]): {
  promotions: number;
  relegations: number;
  stayed: number;
  frozen: number;
} {
  return {
    promotions: movements.filter((m) => m.reason === 'promotion').length,
    relegations: movements.filter((m) => m.reason === 'relegation').length,
    stayed: movements.filter((m) => m.reason === 'stayed').length,
    frozen: movements.filter((m) => m.reason === 'frozen').length,
  };
}
