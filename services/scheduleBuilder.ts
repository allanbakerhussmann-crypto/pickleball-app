/**
 * Schedule Builder Service
 *
 * Generates tournament schedules from registered participants,
 * detects conflicts, and provides resolution options.
 *
 * FILE LOCATION: services/scheduleBuilder.ts
 * VERSION: V06.00
 */

import type {
  ScheduledMatch,
  ScheduleConflict,
  DivisionScheduleBlock,
  CourtAvailability,
  ScheduleGenerationOptions,
  TournamentDay,
} from '../types';

// ============================================
// TIME UTILITIES
// ============================================

/**
 * Parse time string "HH:MM" to minutes from midnight
 */
function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes to time string "HH:MM"
 */
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Add minutes to a time string
 */
function addMinutes(time: string, minutesToAdd: number): string {
  return formatTime(parseTime(time) + minutesToAdd);
}

// ============================================
// CONFLICT DETECTION
// ============================================

/**
 * Find all scheduling conflicts in a list of matches
 */
export function detectConflicts(
  matches: ScheduledMatch[],
  options: ScheduleGenerationOptions
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Group matches by time slot for easier comparison
  const matchesByTime = new Map<string, ScheduledMatch[]>();
  matches.forEach((match) => {
    const key = `${match.dayId}-${match.scheduledTime}`;
    if (!matchesByTime.has(key)) {
      matchesByTime.set(key, []);
    }
    matchesByTime.get(key)!.push(match);
  });

  // Check for player double-booking
  matchesByTime.forEach((slotMatches, timeKey) => {
    const playerMatchMap = new Map<string, ScheduledMatch[]>();

    slotMatches.forEach((match) => {
      const allPlayerIds = [...match.teamA.playerIds, ...match.teamB.playerIds];
      allPlayerIds.forEach((playerId) => {
        if (!playerMatchMap.has(playerId)) {
          playerMatchMap.set(playerId, []);
        }
        playerMatchMap.get(playerId)!.push(match);
      });
    });

    playerMatchMap.forEach((playerMatches, playerId) => {
      if (playerMatches.length > 1) {
        conflicts.push({
          id: `conflict-${Date.now()}-${playerId}`,
          type: 'player_double_booked',
          severity: 'error',
          message: `Player is scheduled for ${playerMatches.length} matches at ${playerMatches[0].scheduledTime}`,
          matchIds: playerMatches.map((m) => m.matchId),
          playerIds: [playerId],
          scheduledTime: playerMatches[0].scheduledTime,
          canAutoFix: true,
          autoFixDescription: 'Move one match to the next available slot',
          ignored: false,
        });
      }
    });
  });

  // Check for court double-booking
  matchesByTime.forEach((slotMatches) => {
    const courtMatchMap = new Map<string, ScheduledMatch[]>();

    slotMatches.forEach((match) => {
      if (!courtMatchMap.has(match.courtId)) {
        courtMatchMap.set(match.courtId, []);
      }
      courtMatchMap.get(match.courtId)!.push(match);
    });

    courtMatchMap.forEach((courtMatches, courtId) => {
      if (courtMatches.length > 1) {
        conflicts.push({
          id: `conflict-${Date.now()}-court-${courtId}`,
          type: 'court_double_booked',
          severity: 'error',
          message: `${courtMatches[0].courtName} has ${courtMatches.length} matches at ${courtMatches[0].scheduledTime}`,
          matchIds: courtMatches.map((m) => m.matchId),
          courtId,
          scheduledTime: courtMatches[0].scheduledTime,
          canAutoFix: true,
          autoFixDescription: 'Reassign matches to different courts',
          ignored: false,
        });
      }
    });
  });

  // Check for insufficient rest between matches
  const matchesByPlayer = new Map<string, ScheduledMatch[]>();
  matches.forEach((match) => {
    const allPlayerIds = [...match.teamA.playerIds, ...match.teamB.playerIds];
    allPlayerIds.forEach((playerId) => {
      if (!matchesByPlayer.has(playerId)) {
        matchesByPlayer.set(playerId, []);
      }
      matchesByPlayer.get(playerId)!.push(match);
    });
  });

  matchesByPlayer.forEach((playerMatches, playerId) => {
    // Sort by time
    const sorted = [...playerMatches].sort((a, b) => {
      if (a.dayId !== b.dayId) return a.dayId.localeCompare(b.dayId);
      return parseTime(a.scheduledTime) - parseTime(b.scheduledTime);
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Only check same-day matches
      if (current.dayId !== next.dayId) continue;

      const currentEnd = parseTime(current.estimatedEndTime);
      const nextStart = parseTime(next.scheduledTime);
      const restMinutes = nextStart - currentEnd;

      if (restMinutes < options.minRestMinutes) {
        conflicts.push({
          id: `conflict-${Date.now()}-rest-${playerId}-${i}`,
          type: 'insufficient_rest',
          severity: 'warning',
          message: `Player has only ${restMinutes} min rest (need ${options.minRestMinutes} min)`,
          matchIds: [current.matchId, next.matchId],
          playerIds: [playerId],
          scheduledTime: next.scheduledTime,
          canAutoFix: true,
          autoFixDescription: `Delay second match by ${options.minRestMinutes - restMinutes} min`,
          ignored: false,
        });
      }
    }
  });

  return conflicts;
}

// ============================================
// SCHEDULE GENERATION
// ============================================

/**
 * Generate division schedule blocks for timeline view
 */
export function generateDivisionBlocks(
  divisions: Array<{
    id: string;
    name: string;
    matchCount: number;
    poolMatchCount?: number;
    bracketMatchCount?: number;
  }>,
  days: TournamentDay[],
  courts: CourtAvailability[],
  options: ScheduleGenerationOptions
): DivisionScheduleBlock[] {
  const blocks: DivisionScheduleBlock[] = [];
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#8B5CF6', // purple
    '#F59E0B', // amber
    '#EC4899', // pink
    '#06B6D4', // cyan
  ];

  let currentDayIndex = 0;
  let currentTime = parseTime(days[0]?.startTime || '09:00');

  divisions.forEach((division, divIndex) => {
    const day = days[currentDayIndex];
    if (!day) return;

    const availableCourts = courts.filter(
      (c) => c.dayId === day.id && c.available
    ).length || 1;

    // Calculate time needed
    const matchesPerSlot = availableCourts;
    const slotsNeeded = Math.ceil(division.matchCount / matchesPerSlot);
    const totalMinutes = slotsNeeded * options.slotDurationMinutes;

    const startTime = formatTime(currentTime);
    const endTime = formatTime(currentTime + totalMinutes);

    blocks.push({
      divisionId: division.id,
      divisionName: division.name,
      dayId: day.id,
      startTime,
      endTime,
      matchCount: division.matchCount,
      stage: 'all',
      color: colors[divIndex % colors.length],
    });

    currentTime += totalMinutes;

    // Check if we need to move to next day
    const dayEnd = parseTime(day.endTime);
    if (currentTime >= dayEnd && currentDayIndex < days.length - 1) {
      currentDayIndex++;
      currentTime = parseTime(days[currentDayIndex].startTime);
    }
  });

  return blocks;
}

/**
 * Generate a schedule from division blocks and registered teams
 */
export function generateSchedule(
  divisionBlocks: DivisionScheduleBlock[],
  registrations: Array<{
    divisionId: string;
    teamId: string;
    teamName: string;
    playerIds: string[];
  }>,
  matchups: Array<{
    divisionId: string;
    matchId: string;
    stage: 'pool' | 'bracket' | 'medal';
    roundNumber?: number;
    matchNumber: number;
    teamAId: string;
    teamBId: string;
  }>,
  courts: CourtAvailability[],
  options: ScheduleGenerationOptions
): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];

  // Group matchups by division
  const matchupsByDivision = new Map<string, typeof matchups>();
  matchups.forEach((m) => {
    if (!matchupsByDivision.has(m.divisionId)) {
      matchupsByDivision.set(m.divisionId, []);
    }
    matchupsByDivision.get(m.divisionId)!.push(m);
  });

  // Create team lookup
  const teamMap = new Map(
    registrations.map((r) => [r.teamId, r])
  );

  // Schedule each division
  divisionBlocks.forEach((block) => {
    const divisionMatchups = matchupsByDivision.get(block.divisionId) || [];
    const availableCourts = courts.filter(
      (c) => c.dayId === block.dayId && c.available
    );

    let currentTime = parseTime(block.startTime);
    let courtIndex = 0;

    divisionMatchups.forEach((matchup, index) => {
      const teamA = teamMap.get(matchup.teamAId);
      const teamB = teamMap.get(matchup.teamBId);
      const court = availableCourts[courtIndex % availableCourts.length];

      if (!court) return;

      const scheduledTime = formatTime(currentTime);
      const estimatedEndTime = addMinutes(scheduledTime, options.slotDurationMinutes);

      matches.push({
        matchId: matchup.matchId,
        divisionId: block.divisionId,
        divisionName: block.divisionName,
        stage: matchup.stage,
        roundNumber: matchup.roundNumber,
        matchNumber: matchup.matchNumber,
        teamA: {
          name: teamA?.teamName || 'TBD',
          playerIds: teamA?.playerIds || [],
        },
        teamB: {
          name: teamB?.teamName || 'TBD',
          playerIds: teamB?.playerIds || [],
        },
        courtId: court.courtId,
        courtName: court.courtName,
        dayId: block.dayId,
        scheduledTime,
        estimatedEndTime,
        durationMinutes: options.slotDurationMinutes,
        isLocked: false,
        hasConflict: false,
      });

      courtIndex++;

      // Move to next time slot when all courts are used
      if (courtIndex >= availableCourts.length) {
        courtIndex = 0;
        currentTime += options.slotDurationMinutes;
      }
    });
  });

  return matches;
}

// ============================================
// CONFLICT RESOLUTION
// ============================================

/**
 * Attempt to auto-fix a conflict by rescheduling matches
 */
export function autoFixConflict(
  conflict: ScheduleConflict,
  matches: ScheduledMatch[],
  courts: CourtAvailability[],
  options: ScheduleGenerationOptions
): ScheduledMatch[] {
  const updatedMatches = [...matches];

  switch (conflict.type) {
    case 'player_double_booked': {
      // Find the second match and move it to next available slot
      const conflictingMatches = updatedMatches.filter((m) =>
        conflict.matchIds.includes(m.matchId)
      );
      if (conflictingMatches.length < 2) return updatedMatches;

      // Keep first match, move second
      const matchToMove = conflictingMatches[1];
      const matchIndex = updatedMatches.findIndex(
        (m) => m.matchId === matchToMove.matchId
      );

      if (matchIndex !== -1) {
        const newTime = addMinutes(matchToMove.scheduledTime, options.slotDurationMinutes);
        updatedMatches[matchIndex] = {
          ...matchToMove,
          scheduledTime: newTime,
          estimatedEndTime: addMinutes(newTime, options.slotDurationMinutes),
        };
      }
      break;
    }

    case 'court_double_booked': {
      // Find an available court and reassign
      const conflictingMatches = updatedMatches.filter((m) =>
        conflict.matchIds.includes(m.matchId)
      );
      if (conflictingMatches.length < 2) return updatedMatches;

      const matchToReassign = conflictingMatches[1];
      const availableCourts = courts.filter(
        (c) => c.dayId === matchToReassign.dayId && c.available && c.courtId !== matchToReassign.courtId
      );

      if (availableCourts.length > 0) {
        const newCourt = availableCourts[0];
        const matchIndex = updatedMatches.findIndex(
          (m) => m.matchId === matchToReassign.matchId
        );
        if (matchIndex !== -1) {
          updatedMatches[matchIndex] = {
            ...matchToReassign,
            courtId: newCourt.courtId,
            courtName: newCourt.courtName,
          };
        }
      }
      break;
    }

    case 'insufficient_rest': {
      // Delay the second match
      const matchToDelay = updatedMatches.find(
        (m) => m.matchId === conflict.matchIds[1]
      );
      if (!matchToDelay) return updatedMatches;

      const matchIndex = updatedMatches.findIndex(
        (m) => m.matchId === matchToDelay.matchId
      );

      if (matchIndex !== -1) {
        const newTime = addMinutes(matchToDelay.scheduledTime, options.minRestMinutes);
        updatedMatches[matchIndex] = {
          ...matchToDelay,
          scheduledTime: newTime,
          estimatedEndTime: addMinutes(newTime, options.slotDurationMinutes),
        };
      }
      break;
    }
  }

  return updatedMatches;
}

/**
 * Auto-fix all conflicts that can be fixed
 */
export function autoFixAllConflicts(
  matches: ScheduledMatch[],
  courts: CourtAvailability[],
  options: ScheduleGenerationOptions
): { matches: ScheduledMatch[]; remainingConflicts: ScheduleConflict[] } {
  let currentMatches = [...matches];
  let iterations = 0;
  const maxIterations = 50; // Prevent infinite loops

  while (iterations < maxIterations) {
    const conflicts = detectConflicts(currentMatches, options);
    const fixableConflicts = conflicts.filter((c) => c.canAutoFix && !c.ignored);

    if (fixableConflicts.length === 0) {
      return { matches: currentMatches, remainingConflicts: conflicts };
    }

    // Fix first conflict
    currentMatches = autoFixConflict(fixableConflicts[0], currentMatches, courts, options);
    iterations++;
  }

  return {
    matches: currentMatches,
    remainingConflicts: detectConflicts(currentMatches, options),
  };
}

// ============================================
// SCHEDULE VALIDATION
// ============================================

/**
 * Validate a schedule is complete and valid
 */
export function validateSchedule(
  matches: ScheduledMatch[],
  expectedMatchCount: number
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check all matches are scheduled
  if (matches.length !== expectedMatchCount) {
    errors.push(`Expected ${expectedMatchCount} matches, but only ${matches.length} are scheduled`);
  }

  // Check all matches have valid times
  matches.forEach((match) => {
    if (!match.scheduledTime) {
      errors.push(`Match ${match.matchId} has no scheduled time`);
    }
    if (!match.courtId) {
      errors.push(`Match ${match.matchId} has no court assigned`);
    }
  });

  // Check for TBD teams in bracket stages
  const bracketMatches = matches.filter((m) => m.stage === 'bracket' || m.stage === 'medal');
  const tbdBracketMatches = bracketMatches.filter(
    (m) => m.teamA.name === 'TBD' || m.teamB.name === 'TBD'
  );
  if (tbdBracketMatches.length > 0) {
    // This is okay - bracket matches have TBD until pool play completes
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// EXPORT HELPERS
// ============================================

/**
 * Export schedule to printable format
 */
export function exportScheduleForPrint(
  matches: ScheduledMatch[],
  days: TournamentDay[]
): string {
  let output = '';

  days.forEach((day) => {
    const dayMatches = matches.filter((m) => m.dayId === day.id);
    if (dayMatches.length === 0) return;

    output += `\n${day.label || 'Day'} - ${day.date}\n`;
    output += '='.repeat(50) + '\n';

    // Group by time
    const byTime = new Map<string, ScheduledMatch[]>();
    dayMatches.forEach((m) => {
      if (!byTime.has(m.scheduledTime)) {
        byTime.set(m.scheduledTime, []);
      }
      byTime.get(m.scheduledTime)!.push(m);
    });

    const sortedTimes = [...byTime.keys()].sort();
    sortedTimes.forEach((time) => {
      output += `\n${time}\n`;
      byTime.get(time)!.forEach((match) => {
        output += `  ${match.courtName}: ${match.teamA.name} vs ${match.teamB.name} (${match.divisionName})\n`;
      });
    });
  });

  return output;
}
