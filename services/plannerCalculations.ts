/**
 * Tournament Planner Calculations Service
 *
 * Provides match count formulas, time estimations, and capacity calculations
 * for the Tournament Planner wizard.
 *
 * FILE LOCATION: services/plannerCalculations.ts
 * VERSION: V06.00
 */

import type { CompetitionFormat } from '../types/formats';
import type {
  TournamentPlannerSettings,
  PlannerDivision,
  PlannerCapacity,
  PlannerGameSettings,
  PlannerTimingSettings,
  TournamentDay,
} from '../types';

// ============================================
// GAME DURATION ESTIMATES
// ============================================

/**
 * Estimated game duration in minutes based on points per game
 * Base times assume "win by 2" - deuce situations add time
 */
const GAME_DURATION_BY_POINTS: Record<11 | 15 | 21, { min: number; avg: number; max: number }> = {
  11: { min: 8, avg: 12, max: 16 },
  15: { min: 12, avg: 17, max: 22 },
  21: { min: 18, avg: 24, max: 30 },
};

/**
 * Win by 1 reduces game time (no deuce situations)
 * Approximately 15-20% faster
 */
const WIN_BY_1_MULTIPLIER = 0.82;

/**
 * Average number of games per match based on best-of setting
 */
const AVG_GAMES_BY_BEST_OF: Record<1 | 3 | 5, number> = {
  1: 1,
  3: 2.3, // Could be 2 or 3 games
  5: 3.5, // Could be 3, 4, or 5 games
};

// ============================================
// MATCH COUNT FORMULAS
// ============================================

/**
 * Calculate number of matches for a round robin format
 * Formula: n(n-1)/2 where n is number of participants
 */
export function calculateRoundRobinMatches(participants: number): number {
  return (participants * (participants - 1)) / 2;
}

/**
 * Calculate number of matches for a single elimination bracket
 * Formula: n-1 matches (winner bracket only)
 * +1 for bronze match if enabled
 */
export function calculateEliminationMatches(
  participants: number,
  hasBronzeMatch: boolean = true
): number {
  const bracketMatches = participants - 1;
  return hasBronzeMatch ? bracketMatches + 1 : bracketMatches;
}

/**
 * Calculate number of matches for Pool Play → Medals format
 */
export function calculatePoolPlayMedalsMatches(
  participants: number,
  poolSize: number = 4,
  advancementRule: 'top_1' | 'top_2' = 'top_2',
  hasBronzeMatch: boolean = true
): { poolMatches: number; bracketMatches: number; totalMatches: number } {
  // Calculate number of pools
  const poolCount = Math.ceil(participants / poolSize);

  // Matches per pool (round robin within pool)
  const matchesPerPool = calculateRoundRobinMatches(poolSize);
  const poolMatches = poolCount * matchesPerPool;

  // Number advancing to bracket
  const advancingPerPool = advancementRule === 'top_1' ? 1 : 2;
  const bracketSize = poolCount * advancingPerPool;

  // Bracket matches
  const bracketMatches = calculateEliminationMatches(bracketSize, hasBronzeMatch);

  return {
    poolMatches,
    bracketMatches,
    totalMatches: poolMatches + bracketMatches,
  };
}

/**
 * Calculate total matches for any format
 */
export function calculateMatchesForFormat(
  format: CompetitionFormat,
  participants: number,
  poolSize: number = 4
): number {
  switch (format) {
    case 'pool_play_medals':
      return calculatePoolPlayMedalsMatches(participants, poolSize).totalMatches;

    case 'round_robin':
      return calculateRoundRobinMatches(participants);

    case 'singles_elimination':
    case 'doubles_elimination':
      return calculateEliminationMatches(participants, true);

    case 'rotating_doubles_box':
    case 'fixed_doubles_box':
      // Box format: round robin within boxes
      // Assuming standard box size of 4-6
      return calculateRoundRobinMatches(Math.min(participants, 6));

    case 'swiss':
      // Swiss: typically log2(n) rounds, each round has n/2 matches
      const rounds = Math.ceil(Math.log2(participants));
      return rounds * Math.floor(participants / 2);

    case 'ladder':
      // Ladder: challenge-based, estimate ~2 matches per player
      return participants * 2;

    case 'king_of_court':
      // King of court: session-based, estimate matches
      return participants * 3;

    case 'team_league_interclub':
      // Team league: round robin between teams
      return calculateRoundRobinMatches(participants);

    default:
      return calculateRoundRobinMatches(participants);
  }
}

// ============================================
// TIME CALCULATIONS
// ============================================

/**
 * Calculate estimated duration for a single match in minutes
 * Factors in: points per game, win by (1 vs 2), and best of (1, 3, 5)
 */
export function calculateMatchDuration(
  gameSettings: PlannerGameSettings,
  timingSettings: PlannerTimingSettings
): { min: number; avg: number; max: number } {
  const baseDuration = GAME_DURATION_BY_POINTS[gameSettings.pointsToWin];
  const avgGames = AVG_GAMES_BY_BEST_OF[gameSettings.bestOf];
  const minGames = Math.ceil(gameSettings.bestOf / 2);

  // Apply win by multiplier - win by 1 is faster (no deuce)
  const winByMultiplier = gameSettings.winBy === 1 ? WIN_BY_1_MULTIPLIER : 1;
  const gameDuration = {
    min: Math.round(baseDuration.min * winByMultiplier),
    avg: Math.round(baseDuration.avg * winByMultiplier),
    max: Math.round(baseDuration.max * winByMultiplier),
  };

  // Calculate match time (warmup + games + between-game breaks)
  const warmup = timingSettings.warmupMinutes;
  const betweenGames = timingSettings.courtChangeMinutes;

  return {
    min: warmup + gameDuration.min * minGames + betweenGames * (minGames - 1),
    avg: warmup + gameDuration.avg * avgGames + betweenGames * (avgGames - 1),
    max: warmup + gameDuration.max * gameSettings.bestOf + betweenGames * (gameSettings.bestOf - 1),
  };
}

/**
 * Calculate total slot duration (match + rest + transition)
 */
export function calculateSlotDuration(
  gameSettings: PlannerGameSettings,
  timingSettings: PlannerTimingSettings
): number {
  const matchDuration = calculateMatchDuration(gameSettings, timingSettings);
  return Math.ceil(matchDuration.avg + timingSettings.restMinutes + timingSettings.courtChangeMinutes);
}

/**
 * Calculate available court hours
 */
export function calculateCourtHours(
  courts: number,
  startTime: string,
  endTime: string
): number {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const hoursPerCourt = (end - start) / 60;
  return courts * hoursPerCourt;
}

/**
 * Parse time string "HH:MM" to minutes from midnight
 */
function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes to time string "HH:MM AM/PM"
 */
function formatTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 < 12 ? 'AM' : 'PM';
  return `${hours12}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Add minutes to a time string
 */
function addMinutesToTime(time: string, minutesToAdd: number): string {
  const totalMinutes = parseTime(time) + minutesToAdd;
  return formatTime(totalMinutes);
}

// ============================================
// DIVISION CALCULATIONS
// ============================================

/**
 * Calculate match count and duration for a division
 * Supports separate pool and medal game settings for pool_play_medals format
 */
export function calculateDivisionStats(
  division: PlannerDivision,
  poolGameSettings: PlannerGameSettings,
  medalGameSettings: PlannerGameSettings,
  timingSettings: PlannerTimingSettings,
  useSeparateMedalSettings: boolean = false
): {
  matchCount: number;
  poolMatches: number;
  medalMatches: number;
  poolCount: number;
  estimatedMinutes: number;
  poolMinutes: number;
  medalMinutes: number;
} {
  // Calculate slot durations
  const poolSlotDuration = calculateSlotDuration(poolGameSettings, timingSettings);
  const medalSlotDuration = useSeparateMedalSettings
    ? calculateSlotDuration(medalGameSettings, timingSettings)
    : poolSlotDuration;

  // For pool_play_medals, split into pool and bracket matches
  if (division.format === 'pool_play_medals') {
    const poolPlayResult = calculatePoolPlayMedalsMatches(
      division.expectedPlayers,
      division.poolSize || 4,
      'top_2',
      true
    );

    const poolMinutes = poolPlayResult.poolMatches * poolSlotDuration;
    const medalMinutes = poolPlayResult.bracketMatches * medalSlotDuration;

    return {
      matchCount: poolPlayResult.totalMatches,
      poolMatches: poolPlayResult.poolMatches,
      medalMatches: poolPlayResult.bracketMatches,
      poolCount: Math.ceil(division.expectedPlayers / (division.poolSize || 4)),
      estimatedMinutes: poolMinutes + medalMinutes,
      poolMinutes,
      medalMinutes,
    };
  }

  // For other formats, use pool settings for all matches
  const matchCount = calculateMatchesForFormat(
    division.format,
    division.expectedPlayers,
    division.poolSize || 4
  );

  const estimatedMinutes = matchCount * poolSlotDuration;

  return {
    matchCount,
    poolMatches: matchCount,
    medalMatches: 0,
    poolCount: 0,
    estimatedMinutes,
    poolMinutes: estimatedMinutes,
    medalMinutes: 0,
  };
}

/**
 * Legacy version for backwards compatibility
 */
export function calculateDivisionStatsLegacy(
  division: PlannerDivision,
  gameSettings: PlannerGameSettings,
  timingSettings: PlannerTimingSettings
): {
  matchCount: number;
  poolCount: number;
  estimatedMinutes: number;
} {
  const result = calculateDivisionStats(division, gameSettings, gameSettings, timingSettings, false);
  return {
    matchCount: result.matchCount,
    poolCount: result.poolCount,
    estimatedMinutes: result.estimatedMinutes,
  };
}

// ============================================
// CAPACITY CALCULATIONS
// ============================================

/**
 * Calculate court hours for a single day
 */
export function calculateDayCourtHours(day: TournamentDay, courts: number): number {
  const start = parseTime(day.startTime);
  const end = parseTime(day.endTime);
  const hoursPerCourt = (end - start) / 60;
  return courts * hoursPerCourt;
}

/**
 * Calculate total court hours across all tournament days
 */
export function calculateTotalCourtHours(days: TournamentDay[], courts: number): number {
  return days.reduce((sum, day) => sum + calculateDayCourtHours(day, courts), 0);
}

/**
 * Calculate full tournament capacity analysis (multi-day support)
 * Now supports separate pool and medal game settings
 */
export function calculateTournamentCapacity(
  settings: TournamentPlannerSettings
): PlannerCapacity {
  const {
    courts,
    days,
    poolGameSettings,
    medalGameSettings,
    useSeparateMedalSettings,
    timingSettings,
    divisions,
  } = settings;

  // Handle legacy single-day or new multi-day format
  const tournamentDays = days && days.length > 0
    ? days
    : [{
        id: 'day-1',
        date: new Date().toISOString().split('T')[0],
        startTime: settings.startTime,
        endTime: settings.endTime,
        label: 'Day 1',
      }];

  // Calculate slot durations for pool and medal matches
  const poolSlotDuration = calculateSlotDuration(poolGameSettings, timingSettings);
  const medalSlotDuration = useSeparateMedalSettings
    ? calculateSlotDuration(medalGameSettings, timingSettings)
    : poolSlotDuration;

  // Calculate per-day availability
  const dayBreakdown = tournamentDays.map((day) => {
    const dayHours = calculateDayCourtHours(day, courts);
    return {
      dayId: day.id,
      date: day.date,
      label: day.label,
      courtHoursAvailable: dayHours,
      courtHoursUsed: 0,
      utilizationPercent: 0,
      fitsInTimeframe: true,
    };
  });

  // Calculate total available court time
  const courtHoursAvailable = calculateTotalCourtHours(tournamentDays, courts);
  const courtMinutesAvailable = courtHoursAvailable * 60;

  // Schedule divisions across days
  // If division has user-specified times (from drag & drop), use those
  // Otherwise, schedule sequentially
  let currentDayIndex = 0;
  let currentTimeInDay = parseTime(tournamentDays[0].startTime);

  const divisionBreakdown = divisions.map((division) => {
    const stats = calculateDivisionStats(
      division,
      poolGameSettings,
      medalGameSettings,
      timingSettings,
      useSeparateMedalSettings
    );

    // With multiple courts, matches can run in parallel
    // Calculate time for pool and medal matches separately
    const poolTimeMinutes = Math.ceil(stats.poolMatches / courts) * poolSlotDuration;
    const medalTimeMinutes = Math.ceil(stats.medalMatches / courts) * medalSlotDuration;
    const divisionMinutes = poolTimeMinutes + medalTimeMinutes;

    // Check if user has manually positioned this division (drag & drop)
    if (division.estimatedStartTime && division.assignedDayId) {
      // Use user-specified times
      const userDayIndex = tournamentDays.findIndex(d => d.id === division.assignedDayId);
      const dayIndex = userDayIndex >= 0 ? userDayIndex : currentDayIndex;
      const divStartMinutes = parseTime(division.estimatedStartTime);
      const divEndMinutes = divStartMinutes + divisionMinutes;

      // Update day usage
      dayBreakdown[dayIndex].courtHoursUsed += divisionMinutes / 60 * courts;

      return {
        divisionId: division.id,
        name: division.name,
        matches: stats.matchCount,
        minutes: divisionMinutes,
        startTime: division.estimatedStartTime,
        endTime: formatTime(divEndMinutes),
        dayId: tournamentDays[dayIndex].id,
      };
    }

    // No user override - schedule sequentially
    const currentDay = tournamentDays[currentDayIndex];
    const dayEndMinutes = parseTime(currentDay.endTime);

    // Check if division fits in current day
    if (currentTimeInDay + divisionMinutes > dayEndMinutes && currentDayIndex < tournamentDays.length - 1) {
      // Move to next day
      currentDayIndex++;
      currentTimeInDay = parseTime(tournamentDays[currentDayIndex].startTime);
    }

    const divStartTime = formatTime(currentTimeInDay);
    currentTimeInDay += divisionMinutes;
    const divEndTime = formatTime(currentTimeInDay);

    // Update day usage
    dayBreakdown[currentDayIndex].courtHoursUsed += divisionMinutes / 60 * courts;

    return {
      divisionId: division.id,
      name: division.name,
      matches: stats.matchCount,
      minutes: divisionMinutes,
      startTime: divStartTime,
      endTime: divEndTime,
      dayId: tournamentDays[currentDayIndex].id,
    };
  });

  // Finalize day breakdown utilization
  dayBreakdown.forEach((day) => {
    const dayData = tournamentDays.find((d) => d.id === day.dayId);
    if (dayData) {
      const dayMinutes = (parseTime(dayData.endTime) - parseTime(dayData.startTime)) * courts;
      day.utilizationPercent = dayMinutes > 0 ? Math.round((day.courtHoursUsed * 60 / dayMinutes) * 100) : 0;
      day.fitsInTimeframe = day.utilizationPercent <= 100;
    }
  });

  // Calculate totals
  const totalPlayers = divisions.reduce((sum, d) => sum + d.expectedPlayers, 0);
  const totalMatches = divisionBreakdown.reduce((sum, d) => sum + d.matches, 0);
  const totalMinutes = divisionBreakdown.reduce((sum, d) => sum + d.minutes, 0);
  const totalHours = totalMinutes / 60;

  // Calculate utilization (use actual calculated minutes, not just match count * slot)
  const courtMinutesUsed = totalMinutes * courts; // Total court-minutes across all courts
  const courtHoursUsed = courtMinutesUsed / 60;
  const utilizationPercent = courtMinutesAvailable > 0
    ? Math.round((courtMinutesUsed / courtMinutesAvailable) * 100)
    : 0;

  // Check if fits in last day
  const lastDay = tournamentDays[currentDayIndex];
  const lastDayEndMinutes = parseTime(lastDay.endTime);
  const fitsInTimeframe = currentTimeInDay <= lastDayEndMinutes;
  const overtimeMinutes = Math.max(0, currentTimeInDay - lastDayEndMinutes);

  // Use average slot duration for suggestions
  const avgSlotDuration = (poolSlotDuration + medalSlotDuration) / 2;

  // Generate warnings and suggestions
  const warningMessages: string[] = [];
  const suggestions: string[] = [];

  if (!fitsInTimeframe) {
    const overtimeHours = Math.ceil(overtimeMinutes / 60 * 10) / 10;
    warningMessages.push(
      `Tournament will run ${overtimeHours} hours over your end time on ${lastDay.label || 'the last day'}`
    );
    suggestions.push(`Extend end time to ${formatTime(currentTimeInDay)}`);
    if (tournamentDays.length === 1) {
      suggestions.push('Add another day to your tournament');
    }
    suggestions.push(`Add ${Math.ceil(overtimeMinutes / (avgSlotDuration * 2))} more courts`);
    suggestions.push('Reduce players or divisions');
  }

  if (utilizationPercent > 90) {
    warningMessages.push('Court utilization is very high - little room for delays');
  }

  if (utilizationPercent < 50 && divisions.length > 0) {
    suggestions.push(
      `You have room for ~${Math.floor((courtMinutesAvailable - courtMinutesUsed) / (avgSlotDuration * 10))} more players`
    );
  }

  // Multi-day benefit message
  if (tournamentDays.length > 1 && fitsInTimeframe) {
    suggestions.push(`Tournament spans ${tournamentDays.length} days - pool play on Day 1, medals on Day 2 works well`);
  }

  // Check for multi-division player conflicts
  if (divisions.length > 1) {
    const sameDayDivisions = divisionBreakdown.filter(
      (d, i, arr) => arr.filter((d2) => d2.dayId === d.dayId).length > 1
    );
    if (sameDayDivisions.length > 0) {
      warningMessages.push('Multiple divisions on same day - players in multiple divisions may have conflicts');
      suggestions.push("We'll detect and resolve conflicts in the Schedule Builder");
    }
  }

  return {
    totalPlayers,
    totalMatches,
    totalMinutes,
    totalHours,
    courtHoursAvailable,
    courtHoursUsed,
    utilizationPercent,
    fitsInTimeframe,
    overtimeMinutes,
    dayBreakdown,
    divisionBreakdown,
    warningMessages,
    suggestions,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get recommended pool size based on participant count
 */
export function getRecommendedPoolSize(participants: number): number {
  if (participants <= 8) return 4;
  if (participants <= 16) return 4;
  if (participants <= 24) return 4;
  if (participants <= 32) return 4;
  return 5; // For larger tournaments, use pools of 5
}

/**
 * Calculate how many players can fit in the available time
 */
export function calculateMaxPlayers(
  courts: number,
  startTime: string,
  endTime: string,
  format: CompetitionFormat,
  slotDuration: number
): number {
  const courtMinutes = calculateCourtHours(courts, startTime, endTime) * 60;
  const totalSlots = Math.floor(courtMinutes / slotDuration);

  // Work backwards from matches to players
  // For pool play: matches ≈ players * 3 (rough estimate)
  // For elimination: matches = players - 1
  // For round robin: matches = players * (players-1) / 2

  switch (format) {
    case 'pool_play_medals':
      return Math.floor(totalSlots / 3);
    case 'singles_elimination':
    case 'doubles_elimination':
      return totalSlots + 1;
    case 'round_robin':
      // Solve: n(n-1)/2 = totalSlots
      // n ≈ sqrt(2 * totalSlots)
      return Math.floor(Math.sqrt(2 * totalSlots));
    default:
      return Math.floor(totalSlots / 3);
  }
}

/**
 * Generate a unique ID for divisions
 */
export function generateDivisionId(): string {
  return `div_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
