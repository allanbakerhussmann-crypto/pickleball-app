/**
 * League Scheduling Service V07.27
 *
 * Schedules league matches to courts and time slots for single-session venues.
 * Ensures no team plays twice in the same slot and enforces rest time requirements.
 *
 * Key Features:
 * - Court/time slot assignment for all matches in a session
 * - Rest time enforcement (minimum gap between same team matches)
 * - Explicit failure handling (no silent failures)
 * - Idempotency via scheduleGenerationId
 * - Support for both singles and doubles leagues
 *
 * FILE LOCATION: services/firebase/leagueScheduling.ts
 * VERSION: V07.27
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  updateDoc,
} from '@firebase/firestore';
import { db } from './config';
import type {
  League,
  LeagueMatch,
  LeagueVenueSettings,
} from '../../types';

// ============================================
// TYPES
// ============================================

export interface ScheduleResult {
  success: boolean;
  scheduledMatches: ScheduledMatch[];
  unscheduledMatches: LeagueMatch[];
  errors: string[];
  generationId: string;
  stats: {
    totalMatches: number;
    scheduledCount: number;
    unscheduledCount: number;
    slotsUsed: number;
    totalSlots: number;
  };
}

export interface ScheduledMatch {
  matchId: string;
  court: string;
  timeSlotIndex: number;
  startTime: string;       // "18:00" format
  endTime: string;         // "18:20" format
  scheduledStartAt: number; // Absolute timestamp
}

export interface ScheduleSlot {
  slotIndex: number;
  courtIndex: number;
  match: LeagueMatch | null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse time string "HH:MM" to minutes from midnight
 */
const parseTimeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Add minutes to a time string and return new time string
 */
const addMinutesToTime = (time: string, minutes: number): string => {
  const totalMinutes = parseTimeToMinutes(time) + minutes;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Calculate absolute timestamp from date and time string
 */
const calculateAbsoluteTimestamp = (
  dateTimestamp: number,
  timeString: string,
  timezone: string = 'Pacific/Auckland'
): number => {
  // Create date from timestamp
  const date = new Date(dateTimestamp);
  const [hours, minutes] = timeString.split(':').map(Number);

  // Set the time on the date
  date.setHours(hours || 0, minutes || 0, 0, 0);

  return date.getTime();
};

/**
 * Generate unique schedule generation ID
 */
const generateScheduleId = (): string => {
  return `sched_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Get team IDs from a match (handles both singles and doubles)
 */
const getTeamIds = (match: LeagueMatch): { teamAId: string; teamBId: string } => {
  return {
    teamAId: match.memberAId,
    teamBId: match.memberBId,
  };
};

// ============================================
// SCHEDULING ALGORITHM
// ============================================

/**
 * Core scheduling algorithm
 *
 * Schedules matches to courts and time slots ensuring:
 * 1. No team plays twice in the same slot
 * 2. Teams have minimum rest time between matches
 * 3. All matches are scheduled if possible, or explicit failure
 */
export const scheduleMatchesToSlots = (
  matches: LeagueMatch[],
  courts: string[],
  venueSettings: LeagueVenueSettings,
  sessionDate: number,
  timezone: string = 'Pacific/Auckland'
): ScheduleResult => {
  const generationId = generateScheduleId();

  const {
    sessionStartTime = '18:00',
    sessionEndTime = '21:00',
    matchDurationMinutes = 20,
    bufferMinutes = 5,
    minRestMinutes = 10,
  } = venueSettings;

  // Calculate time slots
  const slotDuration = matchDurationMinutes + bufferMinutes;
  const startMinutes = parseTimeToMinutes(sessionStartTime);
  const endMinutes = parseTimeToMinutes(sessionEndTime);
  const availableMinutes = Math.max(0, endMinutes - startMinutes);
  const numSlots = slotDuration > 0 ? Math.floor(availableMinutes / slotDuration) : 0;
  const totalSlots = numSlots * courts.length;

  // Calculate rest slots requirement (how many slots must pass before same team can play)
  const restSlots = slotDuration > 0 ? Math.ceil(minRestMinutes / slotDuration) : 1;

  // Initialize scheduling grid: grid[slotIndex][courtIndex] = match | null
  const grid: (LeagueMatch | null)[][] = Array(numSlots)
    .fill(null)
    .map(() => Array(courts.length).fill(null));

  // Track when each team last played: teamLastSlot[teamId] = slot index
  const teamLastSlot: Map<string, number> = new Map();

  const scheduledMatches: ScheduledMatch[] = [];
  const unscheduledMatches: LeagueMatch[] = [];
  const errors: string[] = [];

  // Filter to only schedule incomplete matches (idempotency)
  const matchesToSchedule = matches.filter(m => m.status !== 'completed');

  // Sort matches by round number, then by match order for consistent scheduling
  const sortedMatches = [...matchesToSchedule].sort((a, b) => {
    const roundA = a.roundNumber || 0;
    const roundB = b.roundNumber || 0;
    if (roundA !== roundB) return roundA - roundB;
    return 0;
  });

  // Schedule each match
  for (const match of sortedMatches) {
    const { teamAId, teamBId } = getTeamIds(match);
    let scheduled = false;

    // Find first slot where both teams are free AND rested
    for (let slot = 0; slot < numSlots && !scheduled; slot++) {
      const aLastSlot = teamLastSlot.get(teamAId) ?? -Infinity;
      const bLastSlot = teamLastSlot.get(teamBId) ?? -Infinity;

      // Check rest time requirement
      const aRested = (slot - aLastSlot) >= restSlots;
      const bRested = (slot - bLastSlot) >= restSlots;

      if (aRested && bRested) {
        // Find first available court in this slot
        const courtIdx = grid[slot].findIndex(m => m === null);

        if (courtIdx !== -1) {
          // Assign match to this slot/court
          grid[slot][courtIdx] = match;

          // Track last slot for rest enforcement
          teamLastSlot.set(teamAId, slot);
          teamLastSlot.set(teamBId, slot);

          // Calculate times
          const startTime = addMinutesToTime(sessionStartTime, slot * slotDuration);
          const endTime = addMinutesToTime(startTime, matchDurationMinutes);
          const scheduledStartAt = calculateAbsoluteTimestamp(sessionDate, startTime, timezone);

          scheduledMatches.push({
            matchId: match.id,
            court: courts[courtIdx],
            timeSlotIndex: slot,
            startTime,
            endTime,
            scheduledStartAt,
          });

          scheduled = true;
        }
      }
    }

    if (!scheduled) {
      unscheduledMatches.push(match);
    }
  }

  // Build explicit error messages if any matches failed to schedule
  if (unscheduledMatches.length > 0) {
    errors.push(`${unscheduledMatches.length} matches could not be scheduled`);
    errors.push(`Available: ${numSlots} slots/court × ${courts.length} courts = ${totalSlots} total slots`);
    errors.push(`Required: ${matchesToSchedule.length} matches`);

    if (restSlots > 1) {
      errors.push(`Rest requirement: ${minRestMinutes} mins (${restSlots} slots between team matches)`);
    }

    // List unscheduled matches
    unscheduledMatches.slice(0, 5).forEach(m => {
      errors.push(`- ${m.memberAName} vs ${m.memberBName} (Round ${m.roundNumber || '?'})`);
    });
    if (unscheduledMatches.length > 5) {
      errors.push(`- ... and ${unscheduledMatches.length - 5} more`);
    }
  }

  // Count slots used
  let slotsUsed = 0;
  for (let slot = 0; slot < numSlots; slot++) {
    for (let court = 0; court < courts.length; court++) {
      if (grid[slot][court] !== null) {
        slotsUsed++;
      }
    }
  }

  return {
    success: unscheduledMatches.length === 0,
    scheduledMatches,
    unscheduledMatches,
    errors,
    generationId,
    stats: {
      totalMatches: matchesToSchedule.length,
      scheduledCount: scheduledMatches.length,
      unscheduledCount: unscheduledMatches.length,
      slotsUsed,
      totalSlots,
    },
  };
};

// ============================================
// FIRESTORE OPERATIONS
// ============================================

/**
 * Apply schedule to matches in Firestore
 */
export const applyScheduleToMatches = async (
  leagueId: string,
  scheduleResult: ScheduleResult
): Promise<void> => {
  if (scheduleResult.scheduledMatches.length === 0) {
    return;
  }

  const batch = writeBatch(db);
  const matchesRef = collection(db, 'leagues', leagueId, 'matches');

  for (const scheduled of scheduleResult.scheduledMatches) {
    const matchRef = doc(matchesRef, scheduled.matchId);
    batch.update(matchRef, {
      court: scheduled.court,
      startTime: scheduled.startTime,
      endTime: scheduled.endTime,
      timeSlotIndex: scheduled.timeSlotIndex,
      scheduledStartAt: scheduled.scheduledStartAt,
      scheduleGenerationId: scheduleResult.generationId,
      updatedAt: Date.now(),
    });
  }

  await batch.commit();
};

/**
 * Get all matches for a league (or division)
 */
export const getLeagueMatches = async (
  leagueId: string,
  divisionId?: string | null
): Promise<LeagueMatch[]> => {
  const matchesRef = collection(db, 'leagues', leagueId, 'matches');

  let q = divisionId
    ? query(matchesRef, where('divisionId', '==', divisionId))
    : query(matchesRef);

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeagueMatch));
};

/**
 * Schedule all matches for a league/division
 *
 * Main entry point for scheduling matches to courts and time slots.
 */
export const scheduleLeagueMatches = async (
  league: League,
  divisionId?: string | null,
  sessionDate?: number
): Promise<ScheduleResult> => {
  const venueSettings = league.settings?.venueSettings;

  if (!venueSettings) {
    return {
      success: false,
      scheduledMatches: [],
      unscheduledMatches: [],
      errors: ['Venue settings not configured for this league'],
      generationId: '',
      stats: { totalMatches: 0, scheduledCount: 0, unscheduledCount: 0, slotsUsed: 0, totalSlots: 0 },
    };
  }

  // Get active courts
  const courts = venueSettings.courts
    .filter(c => c.active)
    .sort((a, b) => a.order - b.order)
    .map(c => c.name);

  if (courts.length === 0) {
    return {
      success: false,
      scheduledMatches: [],
      unscheduledMatches: [],
      errors: ['No active courts configured'],
      generationId: '',
      stats: { totalMatches: 0, scheduledCount: 0, unscheduledCount: 0, slotsUsed: 0, totalSlots: 0 },
    };
  }

  // Get matches
  const matches = await getLeagueMatches(league.id, divisionId);

  if (matches.length === 0) {
    return {
      success: true,
      scheduledMatches: [],
      unscheduledMatches: [],
      errors: [],
      generationId: generateScheduleId(),
      stats: { totalMatches: 0, scheduledCount: 0, unscheduledCount: 0, slotsUsed: 0, totalSlots: 0 },
    };
  }

  // Use provided session date or default to season start
  const date = sessionDate || league.seasonStart || Date.now();
  const timezone = league.timezone || 'Pacific/Auckland';

  // Run scheduling algorithm
  const result = scheduleMatchesToSlots(matches, courts, venueSettings, date, timezone);

  // Apply to Firestore if successful
  if (result.success) {
    await applyScheduleToMatches(league.id, result);
  }

  return result;
};

/**
 * Update league schedule status
 */
export const updateScheduleStatus = async (
  leagueId: string,
  status: 'draft' | 'published' | 'locked',
  generationId?: string
): Promise<void> => {
  const leagueRef = doc(db, 'leagues', leagueId);
  const updateData: any = {
    'settings.venueSettings.scheduleStatus': status,
    updatedAt: Date.now(),
  };

  if (generationId) {
    updateData['settings.venueSettings.scheduleGenerationId'] = generationId;
  }

  await updateDoc(leagueRef, updateData);
};

/**
 * Clear scheduling data from matches (for regeneration)
 * Only clears non-completed matches
 */
export const clearMatchSchedules = async (
  leagueId: string,
  divisionId?: string | null
): Promise<number> => {
  const matches = await getLeagueMatches(leagueId, divisionId);
  const matchesToClear = matches.filter(m => m.status !== 'completed');

  if (matchesToClear.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  const matchesRef = collection(db, 'leagues', leagueId, 'matches');

  for (const match of matchesToClear) {
    const matchRef = doc(matchesRef, match.id);
    batch.update(matchRef, {
      court: null,
      startTime: null,
      endTime: null,
      timeSlotIndex: null,
      scheduledStartAt: null,
      scheduleGenerationId: null,
      updatedAt: Date.now(),
    });
  }

  await batch.commit();
  return matchesToClear.length;
};

// ============================================
// CAPACITY VALIDATION
// ============================================

/**
 * Check if a team count exceeds venue capacity
 */
export const checkTeamCapacity = (
  teamCount: number,
  venueSettings: LeagueVenueSettings
): { fits: boolean; maxTeams: number; reason?: string } => {
  const {
    sessionStartTime = '18:00',
    sessionEndTime = '21:00',
    matchDurationMinutes = 20,
    bufferMinutes = 5,
  } = venueSettings;

  const courts = venueSettings.courts.filter(c => c.active).length;

  // Calculate capacity
  const slotDuration = matchDurationMinutes + bufferMinutes;
  const startMinutes = parseTimeToMinutes(sessionStartTime);
  const endMinutes = parseTimeToMinutes(sessionEndTime);
  const availableMinutes = Math.max(0, endMinutes - startMinutes);
  const slotsPerCourt = slotDuration > 0 ? Math.floor(availableMinutes / slotDuration) : 0;
  const totalSlots = slotsPerCourt * courts;

  // Calculate max teams
  // Guard 1: Time slots - n(n-1)/2 <= totalSlots
  const maxTeamsBySlots = Math.floor((1 + Math.sqrt(1 + 8 * totalSlots)) / 2);

  // Guard 2: Courts - n <= courts * 2
  const maxTeamsByCourts = courts * 2;

  const maxTeams = Math.min(maxTeamsBySlots, maxTeamsByCourts);
  const roundRobinMatches = (teamCount * (teamCount - 1)) / 2;

  if (teamCount > maxTeams) {
    if (teamCount > maxTeamsByCourts) {
      return {
        fits: false,
        maxTeams,
        reason: `Not enough courts. ${courts} courts support max ${maxTeamsByCourts} teams.`,
      };
    }
    if (roundRobinMatches > totalSlots) {
      return {
        fits: false,
        maxTeams,
        reason: `Not enough time slots. ${roundRobinMatches} matches need ${roundRobinMatches} slots, but only ${totalSlots} available.`,
      };
    }
  }

  return { fits: teamCount <= maxTeams, maxTeams };
};
