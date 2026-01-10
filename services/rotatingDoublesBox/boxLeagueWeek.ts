/**
 * Box League Week Service
 *
 * Manages the weekly state machine:
 * Draft → Active → Closing → Finalized
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueWeek.ts
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
  BoxLeagueWeek,
  BoxWeekState,
  BoxAssignment,
  WeekSession,
  PlayerAttendance,
  WeekRulesSnapshot,
  BoxCompletionStatus,
  RotatingDoublesBoxSettings,
} from '../../types/rotatingDoublesBox';
import { getRoundCount, getMatchesPerPlayer } from '../../types/rotatingDoublesBox';
import { getSeason, markWeekActive, markWeekCompleted } from './boxLeagueSeason';

// ============================================
// FIRESTORE PATHS
// ============================================

/**
 * Get weeks collection reference
 */
function getWeeksCollection(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'boxWeeks');
}

/**
 * Get week document reference
 */
function getWeekDoc(leagueId: string, weekNumber: number) {
  return doc(db, 'leagues', leagueId, 'boxWeeks', weekNumber.toString());
}

// ============================================
// CREATE WEEK DRAFT
// ============================================

/**
 * Create a new week in draft state
 *
 * @param params - Week creation parameters
 * @returns Created week document
 */
export async function createWeekDraft(params: {
  leagueId: string;
  seasonId: string;
  weekNumber: number;
  scheduledDate: number;
  boxAssignments: BoxAssignment[];
  sessions: WeekSession[];
  courtAssignments: { boxNumber: number; courtLabel: string }[];
  settings: RotatingDoublesBoxSettings;
}): Promise<BoxLeagueWeek> {
  const {
    leagueId,
    seasonId,
    weekNumber,
    scheduledDate,
    boxAssignments,
    sessions,
    courtAssignments,
    settings,
  } = params;

  // Determine box sizes from assignments
  const boxSizes = boxAssignments.map((ba) => ba.playerIds.length as 4 | 5 | 6);

  // Calculate expected matches and rounds based on box sizes
  // Use the largest box size for consistency (or could calculate per-box)
  const primaryBoxSize = boxSizes[0] || 5;

  // Create rules snapshot from current settings
  const rulesSnapshot: WeekRulesSnapshot = {
    pointsTo: settings.gameSettings.pointsPerGame,
    winBy: settings.gameSettings.winBy,
    bestOf: settings.gameSettings.bestOf,
    verificationMethod: settings.scoreVerification.verificationMethod,
    promotionCount: settings.promotionCount,
    relegationCount: settings.relegationCount,
    tiebreakers: [...settings.tiebreakers],
    minCompletedRoundsForMovement: settings.minCompletedRoundsForMovement ?? getRoundCount(primaryBoxSize),
  };

  // Initialize attendance as not_checked_in for all players
  const allPlayerIds = boxAssignments.flatMap((ba) => ba.playerIds);
  const attendance: PlayerAttendance[] = allPlayerIds.map((playerId) => ({
    playerId,
    status: 'not_checked_in',
  }));

  // Initialize box completion status
  const boxCompletionStatus: BoxCompletionStatus[] = boxAssignments.map((ba) => ({
    boxNumber: ba.boxNumber,
    completedRounds: 0,
    totalRounds: getRoundCount(ba.playerIds.length as 4 | 5 | 6),
    movementFrozen: false,
  }));

  // Calculate total matches
  const totalMatches = boxAssignments.reduce((sum, ba) => {
    return sum + getRoundCount(ba.playerIds.length as 4 | 5 | 6);
  }, 0);

  const now = Date.now();

  const week: BoxLeagueWeek = {
    id: weekNumber.toString(),
    leagueId,
    seasonId,
    weekNumber,
    state: 'draft',
    scheduledDate,
    weekStatus: 'scheduled',
    sessions,
    boxAssignments,
    courtAssignments,
    expectedMatchesPerPlayer: getMatchesPerPlayer(primaryBoxSize),
    roundCount: getRoundCount(primaryBoxSize),
    rulesSnapshot,
    attendance,
    matchIds: [],
    totalMatches,
    completedMatches: 0,
    pendingVerificationCount: 0,
    disputedCount: 0,
    boxCompletionStatus,
    draftedAt: now,
  };

  await setDoc(getWeekDoc(leagueId, weekNumber), week);

  return week;
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Get a week by number
 */
export async function getWeek(
  leagueId: string,
  weekNumber: number
): Promise<BoxLeagueWeek | null> {
  const weekDoc = await getDoc(getWeekDoc(leagueId, weekNumber));

  if (!weekDoc.exists()) {
    return null;
  }

  return weekDoc.data() as BoxLeagueWeek;
}

/**
 * Get all weeks for a league (ordered by week number)
 */
export async function getWeeks(leagueId: string): Promise<BoxLeagueWeek[]> {
  const q = query(getWeeksCollection(leagueId), orderBy('weekNumber', 'asc'));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as BoxLeagueWeek);
}

/**
 * Get the current (non-finalized) week
 */
export async function getCurrentWeek(
  leagueId: string
): Promise<BoxLeagueWeek | null> {
  // Get the first non-finalized week
  const q = query(
    getWeeksCollection(leagueId),
    where('state', 'in', ['draft', 'active', 'closing']),
    orderBy('weekNumber', 'asc')
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as BoxLeagueWeek;
}

// ============================================
// STATE TRANSITIONS
// ============================================

/**
 * Check if a state transition is valid
 */
export function canTransitionTo(
  week: BoxLeagueWeek,
  targetState: BoxWeekState
): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];

  // Valid transitions
  const validTransitions: Record<BoxWeekState, BoxWeekState[]> = {
    draft: ['active'],
    active: ['closing'],
    closing: ['finalized'],
    finalized: [], // Terminal state
  };

  if (!validTransitions[week.state].includes(targetState)) {
    blockers.push(
      `Cannot transition from ${week.state} to ${targetState}`
    );
  }

  // Specific transition requirements
  if (targetState === 'active') {
    if (week.boxAssignments.length === 0) {
      blockers.push('No box assignments configured');
    }

    // Check each box has valid player count
    for (const ba of week.boxAssignments) {
      const size = ba.playerIds.length;
      if (size < 4 || size > 6) {
        blockers.push(
          `Box ${ba.boxNumber} has invalid size: ${size} (must be 4-6)`
        );
      }
    }
  }

  if (targetState === 'finalized') {
    if (week.disputedCount > 0) {
      blockers.push(
        `Cannot finalize with ${week.disputedCount} disputed matches`
      );
    }

    if (week.pendingVerificationCount > 0) {
      blockers.push(
        `Cannot finalize with ${week.pendingVerificationCount} pending verifications`
      );
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
  };
}

/**
 * Activate a week (draft → active)
 *
 * - Freezes the rules snapshot
 * - Generates matches for all boxes
 * - Updates season week status
 *
 * @returns Match IDs generated
 */
export async function activateWeek(
  leagueId: string,
  weekNumber: number,
  _activatedByUserId: string
): Promise<{ matchIds: string[] }> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  const transition = canTransitionTo(week, 'active');
  if (!transition.allowed) {
    throw new Error(
      `Cannot activate week: ${transition.blockers.join(', ')}`
    );
  }

  // Import match factory dynamically to avoid circular imports
  const { generateMatchesForWeek } = await import('./boxLeagueMatchFactory');

  // Generate matches for all boxes
  const matchIds = await generateMatchesForWeek(leagueId, week);

  // Update week state
  const now = Date.now();
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    state: 'active',
    activatedAt: now,
    matchIds,
    weekStatus: 'active',
  });

  // Update season week status
  await markWeekActive(leagueId, week.seasonId, weekNumber);

  return { matchIds };
}

/**
 * Start closing a week (active → closing)
 *
 * Called when all matches are completed or deadline passed
 */
export async function startClosing(
  leagueId: string,
  weekNumber: number
): Promise<{ pendingCount: number; disputedCount: number }> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  const transition = canTransitionTo(week, 'closing');
  if (!transition.allowed) {
    throw new Error(
      `Cannot start closing: ${transition.blockers.join(', ')}`
    );
  }

  // Count pending and disputed matches
  const { getMatchCounts } = await import('./boxLeagueMatchFactory');
  const counts = await getMatchCounts(leagueId, week.matchIds);

  // Update week state
  const now = Date.now();
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    state: 'closing',
    closingStartedAt: now,
    pendingVerificationCount: counts.pending,
    disputedCount: counts.disputed,
    completedMatches: counts.completed,
  });

  return {
    pendingCount: counts.pending,
    disputedCount: counts.disputed,
  };
}

/**
 * Finalize a week (closing → finalized)
 *
 * - Enforces strict finalization rules
 * - Computes standings snapshot
 * - Applies promotion/relegation movements
 * - Creates next week draft
 */
export async function finalizeWeek(
  leagueId: string,
  weekNumber: number,
  finalizedByUserId: string
): Promise<{
  standingsSnapshot: BoxLeagueWeek['standingsSnapshot'];
  movements: BoxLeagueWeek['movements'];
  nextWeekCreated: boolean;
}> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  const transition = canTransitionTo(week, 'finalized');
  if (!transition.allowed) {
    throw new Error(
      `Cannot finalize week: ${transition.blockers.join(', ')}`
    );
  }

  // Import services dynamically to avoid circular imports
  const { calculateWeekStandings, createStandingsSnapshot } = await import(
    './boxLeagueStandings'
  );
  const { applyMovements, generateNextWeekAssignments } = await import(
    './boxLeaguePromotion'
  );

  // Calculate standings from match results
  const standings = await calculateWeekStandings(leagueId, week);

  // Create standings snapshot
  const standingsSnapshot = await createStandingsSnapshot(week, standings);

  // Apply movements (promotion/relegation)
  const movements = applyMovements(week, standings);

  // Generate next week assignments
  const nextWeekAssignments = generateNextWeekAssignments(
    week.boxAssignments,
    movements
  );

  // Update week with finalization data
  const now = Date.now();
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    state: 'finalized',
    finalizedAt: now,
    finalizedByUserId,
    standingsSnapshot,
    movements,
  });

  // Update season week status
  await markWeekCompleted(leagueId, week.seasonId, weekNumber);

  // Create next week draft if season has more weeks
  const season = await getSeason(leagueId, week.seasonId);
  let nextWeekCreated = false;

  if (season && weekNumber < season.totalWeeks) {
    const nextWeekNumber = weekNumber + 1;
    const nextWeekSchedule = season.weekSchedule.find(
      (w) => w.weekNumber === nextWeekNumber
    );

    if (nextWeekSchedule && nextWeekSchedule.status !== 'cancelled') {
      // Determine scheduled date (use rescheduled date if postponed)
      const scheduledDate =
        nextWeekSchedule.status === 'postponed' && nextWeekSchedule.rescheduledTo
          ? nextWeekSchedule.rescheduledTo
          : nextWeekSchedule.scheduledDate;

      await createWeekDraft({
        leagueId,
        seasonId: week.seasonId,
        weekNumber: nextWeekNumber,
        scheduledDate,
        boxAssignments: nextWeekAssignments,
        sessions: week.sessions, // Carry forward sessions
        courtAssignments: week.courtAssignments, // Carry forward courts
        settings: season.rulesSnapshot,
      });

      nextWeekCreated = true;
    }
  }

  return {
    standingsSnapshot,
    movements,
    nextWeekCreated,
  };
}

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update box assignments for a draft week
 */
export async function updateBoxAssignments(
  leagueId: string,
  weekNumber: number,
  boxAssignments: BoxAssignment[]
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state !== 'draft') {
    throw new Error('Can only update box assignments in draft state');
  }

  // Recalculate attendance for new player set
  const allPlayerIds = boxAssignments.flatMap((ba) => ba.playerIds);
  const attendance: PlayerAttendance[] = allPlayerIds.map((playerId) => {
    // Preserve existing attendance status if player was already assigned
    const existing = week.attendance.find((a) => a.playerId === playerId);
    return existing || { playerId, status: 'not_checked_in' };
  });

  // Recalculate box completion status
  const boxCompletionStatus: BoxCompletionStatus[] = boxAssignments.map((ba) => ({
    boxNumber: ba.boxNumber,
    completedRounds: 0,
    totalRounds: getRoundCount(ba.playerIds.length as 4 | 5 | 6),
    movementFrozen: false,
  }));

  // Calculate total matches
  const totalMatches = boxAssignments.reduce((sum, ba) => {
    return sum + getRoundCount(ba.playerIds.length as 4 | 5 | 6);
  }, 0);

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    boxAssignments,
    attendance,
    boxCompletionStatus,
    totalMatches,
  });
}

/**
 * Update court assignments for a draft week
 */
export async function updateCourtAssignments(
  leagueId: string,
  weekNumber: number,
  courtAssignments: { boxNumber: number; courtLabel: string }[]
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state !== 'draft') {
    throw new Error('Can only update court assignments in draft state');
  }

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    courtAssignments,
  });
}

/**
 * Update sessions for a draft week
 */
export async function updateSessions(
  leagueId: string,
  weekNumber: number,
  sessions: WeekSession[]
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state !== 'draft') {
    throw new Error('Can only update sessions in draft state');
  }

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    sessions,
  });
}

/**
 * Freeze movement for a specific box (organizer override)
 */
export async function freezeBoxMovement(
  leagueId: string,
  weekNumber: number,
  boxNumber: number,
  frozen: boolean
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can freeze movement at any point before finalization
  if (week.state === 'finalized') {
    throw new Error('Cannot change movement freeze after finalization');
  }

  const updatedStatus = week.boxCompletionStatus.map((s) =>
    s.boxNumber === boxNumber ? { ...s, movementFrozen: frozen } : s
  );

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    boxCompletionStatus: updatedStatus,
  });
}

// ============================================
// MATCH TRACKING
// ============================================

/**
 * Update match counts (called when matches complete)
 */
export async function updateMatchCounts(
  leagueId: string,
  weekNumber: number,
  counts: {
    completed: number;
    pending: number;
    disputed: number;
  }
): Promise<void> {
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    completedMatches: counts.completed,
    pendingVerificationCount: counts.pending,
    disputedCount: counts.disputed,
  });
}

/**
 * Update box completion status (called when matches complete)
 */
export async function updateBoxCompletion(
  leagueId: string,
  weekNumber: number,
  boxNumber: number,
  completedRounds: number
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  const updatedStatus = week.boxCompletionStatus.map((s) =>
    s.boxNumber === boxNumber ? { ...s, completedRounds } : s
  );

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    boxCompletionStatus: updatedStatus,
  });
}
