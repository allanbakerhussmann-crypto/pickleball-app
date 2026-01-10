/**
 * Box League Season Service
 *
 * Handles season lifecycle: setup → active → completed
 * Seasons define the calendar and rules for box league play.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueSeason.ts
 * VERSION: V07.25
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
} from '@firebase/firestore';
import { db } from '../firebase/config';
import type {
  BoxLeagueSeason,
  WeekScheduleEntry,
  WeekStatus,
  RotatingDoublesBoxSettings,
} from '../../types/rotatingDoublesBox';

// ============================================
// FIRESTORE PATHS
// ============================================

/**
 * Get season collection reference
 */
function getSeasonsCollection(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'boxSeasons');
}

/**
 * Get season document reference
 */
function getSeasonDoc(leagueId: string, seasonId: string) {
  return doc(db, 'leagues', leagueId, 'boxSeasons', seasonId);
}

// ============================================
// CREATE SEASON
// ============================================

/**
 * Create a new box league season
 *
 * @param leagueId - Parent league ID
 * @param params - Season parameters
 * @returns Created season with generated ID
 */
export async function createSeason(
  leagueId: string,
  params: {
    name: string;
    startDate: Date;
    endDate: Date;
    totalWeeks: number;
    weekDates: Date[];
    settings: RotatingDoublesBoxSettings;
  }
): Promise<BoxLeagueSeason> {
  // Validate dates
  if (params.startDate >= params.endDate) {
    throw new Error('Start date must be before end date');
  }

  if (params.weekDates.length !== params.totalWeeks) {
    throw new Error(
      `Week dates count (${params.weekDates.length}) must match total weeks (${params.totalWeeks})`
    );
  }

  // Generate week schedule
  const weekSchedule: WeekScheduleEntry[] = params.weekDates.map((date, index) => ({
    weekNumber: index + 1,
    scheduledDate: date.getTime(),
    status: 'scheduled' as WeekStatus,
  }));

  // Create season document
  const seasonRef = doc(getSeasonsCollection(leagueId));
  const now = Date.now();

  const season: BoxLeagueSeason = {
    id: seasonRef.id,
    leagueId,
    name: params.name,
    startDate: params.startDate.getTime(),
    endDate: params.endDate.getTime(),
    totalWeeks: params.totalWeeks,
    weekSchedule,
    state: 'setup',
    rulesSnapshot: params.settings,
    createdAt: now,
  };

  await setDoc(seasonRef, season);

  return season;
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Get a season by ID
 */
export async function getSeason(
  leagueId: string,
  seasonId: string
): Promise<BoxLeagueSeason | null> {
  const seasonDoc = await getDoc(getSeasonDoc(leagueId, seasonId));

  if (!seasonDoc.exists()) {
    return null;
  }

  return seasonDoc.data() as BoxLeagueSeason;
}

/**
 * Get the active season for a league
 */
export async function getActiveSeason(
  leagueId: string
): Promise<BoxLeagueSeason | null> {
  const q = query(
    getSeasonsCollection(leagueId),
    where('state', '==', 'active')
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  // Should only be one active season
  return snapshot.docs[0].data() as BoxLeagueSeason;
}

/**
 * Get all seasons for a league (ordered by start date)
 */
export async function getSeasons(leagueId: string): Promise<BoxLeagueSeason[]> {
  const q = query(
    getSeasonsCollection(leagueId),
    orderBy('startDate', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as BoxLeagueSeason);
}

// ============================================
// STATE TRANSITIONS
// ============================================

/**
 * Activate a season (setup → active)
 *
 * - Freezes the rules snapshot
 * - Creates week 1 in draft state
 * - Only one season can be active at a time
 *
 * @returns Updated season
 */
export async function activateSeason(
  leagueId: string,
  seasonId: string
): Promise<BoxLeagueSeason> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  if (season.state !== 'setup') {
    throw new Error(`Cannot activate season in state: ${season.state}`);
  }

  // Check no other active season
  const activeSeason = await getActiveSeason(leagueId);
  if (activeSeason) {
    throw new Error(
      `League already has an active season: ${activeSeason.name}. Complete or cancel it first.`
    );
  }

  // Update season state
  const now = Date.now();
  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    state: 'active',
    activatedAt: now,
  });

  return {
    ...season,
    state: 'active',
    activatedAt: now,
  };
}

/**
 * Complete a season (active → completed)
 *
 * Called after all weeks are finalized
 */
export async function completeSeason(
  leagueId: string,
  seasonId: string
): Promise<BoxLeagueSeason> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  if (season.state !== 'active') {
    throw new Error(`Cannot complete season in state: ${season.state}`);
  }

  // Check all weeks are finalized or cancelled
  const incompleteWeeks = season.weekSchedule.filter(
    (w) => w.status !== 'completed' && w.status !== 'cancelled'
  );

  if (incompleteWeeks.length > 0) {
    throw new Error(
      `Cannot complete season with ${incompleteWeeks.length} incomplete weeks`
    );
  }

  // Update season state
  const now = Date.now();
  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    state: 'completed',
    completedAt: now,
  });

  return {
    ...season,
    state: 'completed',
    completedAt: now,
  };
}

/**
 * Cancel a season (any state → cancelled)
 *
 * Emergency operation - cancels all remaining weeks
 */
export async function cancelSeason(
  leagueId: string,
  seasonId: string,
  reason: string
): Promise<BoxLeagueSeason> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  if (season.state === 'completed' || season.state === 'cancelled') {
    throw new Error(`Cannot cancel season in state: ${season.state}`);
  }

  // Cancel all non-completed weeks
  const updatedWeekSchedule = season.weekSchedule.map((week) => {
    if (week.status !== 'completed') {
      return {
        ...week,
        status: 'cancelled' as WeekStatus,
        cancellationReason: reason,
      };
    }
    return week;
  });

  // Update season state
  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    state: 'cancelled',
    weekSchedule: updatedWeekSchedule,
  });

  return {
    ...season,
    state: 'cancelled',
    weekSchedule: updatedWeekSchedule,
  };
}

// ============================================
// WEEK SCHEDULE MANAGEMENT
// ============================================

/**
 * Update a week's scheduled date (reschedule)
 */
export async function rescheduleWeek(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  newDate: Date,
  reason?: string
): Promise<BoxLeagueSeason> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  const weekIndex = weekNumber - 1;
  if (weekIndex < 0 || weekIndex >= season.weekSchedule.length) {
    throw new Error(`Invalid week number: ${weekNumber}`);
  }

  const week = season.weekSchedule[weekIndex];
  if (week.status === 'completed' || week.status === 'cancelled') {
    throw new Error(`Cannot reschedule week in status: ${week.status}`);
  }

  // Update week schedule
  const updatedWeekSchedule = [...season.weekSchedule];
  updatedWeekSchedule[weekIndex] = {
    ...week,
    status: 'postponed',
    rescheduledTo: newDate.getTime(),
    cancellationReason: reason,
  };

  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    weekSchedule: updatedWeekSchedule,
  });

  return {
    ...season,
    weekSchedule: updatedWeekSchedule,
  };
}

/**
 * Cancel a week (no reschedule)
 */
export async function cancelWeek(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  reason: string
): Promise<BoxLeagueSeason> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  const weekIndex = weekNumber - 1;
  if (weekIndex < 0 || weekIndex >= season.weekSchedule.length) {
    throw new Error(`Invalid week number: ${weekNumber}`);
  }

  const week = season.weekSchedule[weekIndex];
  if (week.status === 'completed') {
    throw new Error('Cannot cancel a completed week');
  }

  // Update week schedule
  const updatedWeekSchedule = [...season.weekSchedule];
  updatedWeekSchedule[weekIndex] = {
    ...week,
    status: 'cancelled',
    cancellationReason: reason,
  };

  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    weekSchedule: updatedWeekSchedule,
  });

  return {
    ...season,
    weekSchedule: updatedWeekSchedule,
  };
}

/**
 * Mark a week as completed in the season schedule
 *
 * Called by boxLeagueWeek.finalizeWeek() after week finalization
 */
export async function markWeekCompleted(
  leagueId: string,
  seasonId: string,
  weekNumber: number
): Promise<void> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  const weekIndex = weekNumber - 1;
  if (weekIndex < 0 || weekIndex >= season.weekSchedule.length) {
    throw new Error(`Invalid week number: ${weekNumber}`);
  }

  // Update week schedule
  const updatedWeekSchedule = [...season.weekSchedule];
  updatedWeekSchedule[weekIndex] = {
    ...updatedWeekSchedule[weekIndex],
    status: 'completed',
  };

  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    weekSchedule: updatedWeekSchedule,
  });
}

/**
 * Mark a week as active in the season schedule
 *
 * Called by boxLeagueWeek.activateWeek() when week goes active
 */
export async function markWeekActive(
  leagueId: string,
  seasonId: string,
  weekNumber: number
): Promise<void> {
  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  const weekIndex = weekNumber - 1;
  if (weekIndex < 0 || weekIndex >= season.weekSchedule.length) {
    throw new Error(`Invalid week number: ${weekNumber}`);
  }

  // Update week schedule
  const updatedWeekSchedule = [...season.weekSchedule];
  updatedWeekSchedule[weekIndex] = {
    ...updatedWeekSchedule[weekIndex],
    status: 'active',
  };

  await updateDoc(getSeasonDoc(leagueId, seasonId), {
    weekSchedule: updatedWeekSchedule,
  });
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Check if season can be activated
 */
export async function canActivateSeason(
  leagueId: string,
  seasonId: string
): Promise<{ canActivate: boolean; blockers: string[] }> {
  const blockers: string[] = [];

  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    return { canActivate: false, blockers: ['Season not found'] };
  }

  if (season.state !== 'setup') {
    blockers.push(`Season is already in state: ${season.state}`);
  }

  const activeSeason = await getActiveSeason(leagueId);
  if (activeSeason) {
    blockers.push(`Another season is already active: ${activeSeason.name}`);
  }

  if (season.totalWeeks === 0) {
    blockers.push('Season has no weeks scheduled');
  }

  if (season.weekSchedule.length === 0) {
    blockers.push('Week schedule is empty');
  }

  return {
    canActivate: blockers.length === 0,
    blockers,
  };
}

/**
 * Check if season can be completed
 */
export async function canCompleteSeason(
  leagueId: string,
  seasonId: string
): Promise<{ canComplete: boolean; blockers: string[] }> {
  const blockers: string[] = [];

  const season = await getSeason(leagueId, seasonId);

  if (!season) {
    return { canComplete: false, blockers: ['Season not found'] };
  }

  if (season.state !== 'active') {
    blockers.push(`Season is in state: ${season.state}, must be active`);
  }

  const incompleteWeeks = season.weekSchedule.filter(
    (w) => w.status !== 'completed' && w.status !== 'cancelled'
  );

  if (incompleteWeeks.length > 0) {
    blockers.push(
      `${incompleteWeeks.length} weeks not yet completed: ${incompleteWeeks
        .map((w) => `Week ${w.weekNumber}`)
        .join(', ')}`
    );
  }

  return {
    canComplete: blockers.length === 0,
    blockers,
  };
}

// ============================================
// SEASON INFO HELPERS
// ============================================

/**
 * Get the current week number for a season
 *
 * Returns the first non-completed, non-cancelled week
 */
export function getCurrentWeekNumber(season: BoxLeagueSeason): number | null {
  const currentWeek = season.weekSchedule.find(
    (w) => w.status !== 'completed' && w.status !== 'cancelled'
  );

  return currentWeek?.weekNumber || null;
}

/**
 * Get the next scheduled date for a season
 */
export function getNextScheduledDate(season: BoxLeagueSeason): Date | null {
  const nextWeek = season.weekSchedule.find(
    (w) =>
      w.status === 'scheduled' ||
      w.status === 'active' ||
      w.status === 'postponed'
  );

  if (!nextWeek) {
    return null;
  }

  // Use rescheduled date if postponed
  const dateMs =
    nextWeek.status === 'postponed' && nextWeek.rescheduledTo
      ? nextWeek.rescheduledTo
      : nextWeek.scheduledDate;

  return new Date(dateMs);
}

/**
 * Get season progress summary
 */
export function getSeasonProgress(season: BoxLeagueSeason): {
  completedWeeks: number;
  cancelledWeeks: number;
  remainingWeeks: number;
  totalWeeks: number;
  percentComplete: number;
} {
  const completedWeeks = season.weekSchedule.filter(
    (w) => w.status === 'completed'
  ).length;
  const cancelledWeeks = season.weekSchedule.filter(
    (w) => w.status === 'cancelled'
  ).length;
  const remainingWeeks = season.weekSchedule.filter(
    (w) => w.status !== 'completed' && w.status !== 'cancelled'
  ).length;

  // Progress based on completed + cancelled (cancelled weeks still count as "done")
  const totalPlayableWeeks = season.totalWeeks;
  const doneWeeks = completedWeeks + cancelledWeeks;
  const percentComplete =
    totalPlayableWeeks > 0 ? Math.round((doneWeeks / totalPlayableWeeks) * 100) : 0;

  return {
    completedWeeks,
    cancelledWeeks,
    remainingWeeks,
    totalWeeks: season.totalWeeks,
    percentComplete,
  };
}
