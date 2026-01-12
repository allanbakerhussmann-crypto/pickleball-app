/**
 * Box League Week Service
 *
 * Manages the weekly state machine:
 * Draft → Active → Closing → Finalized
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueWeek.ts
 * VERSION: V07.40
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
  runTransaction,
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
  PlayerMovement,
} from '../../types/rotatingDoublesBox';
import { getRoundCount, getMatchesPerPlayer } from '../../types/rotatingDoublesBox';
import { getSeason, markWeekActive, markWeekCompleted } from './boxLeagueSeason';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * V07.40: Deep equality check for box assignments without mutating arrays
 *
 * Compares two BoxAssignment arrays by box number and player IDs.
 * Uses slice().sort() to avoid mutating original arrays.
 */
export function deepEqualBoxAssignments(
  a: BoxAssignment[],
  b: BoxAssignment[]
): boolean {
  if (a.length !== b.length) return false;

  // Create sorted copies by boxNumber (don't mutate originals)
  const sortedA = [...a].sort((x, y) => x.boxNumber - y.boxNumber);
  const sortedB = [...b].sort((x, y) => x.boxNumber - y.boxNumber);

  for (let i = 0; i < sortedA.length; i++) {
    const boxA = sortedA[i];
    const boxB = sortedB[i];

    if (boxA.boxNumber !== boxB.boxNumber) return false;
    if (boxA.playerIds.length !== boxB.playerIds.length) return false;

    // Sort player IDs for comparison (don't mutate originals)
    const idsA = [...boxA.playerIds].sort();
    const idsB = [...boxB.playerIds].sort();

    for (let j = 0; j < idsA.length; j++) {
      if (idsA[j] !== idsB[j]) return false;
    }
  }

  return true;
}

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
 * V07.40: Activate a week (draft → active) with PROMOTION FIX
 *
 * PROMOTION BUG FIX:
 * - For weekNumber > 1, computes assignmentsToUse from prevWeek.finalized standings
 * - Generates matches from correct assignments (not stale week.boxAssignments)
 * - If assignments differ, updates week doc inside the SAME TRANSACTION
 *
 * IDEMPOTENCY:
 * - If week is already 'active' with matchIds, returns existing matchIds
 * - If week has matchIds in 'draft' state (edge case), throws error
 *
 * ATOMICITY:
 * - Uses runTransaction to read prevWeek, compute assignments, write matches,
 *   and update week doc atomically
 * - Uses deterministic matchIds to prevent duplicates on retry
 *
 * @returns Match IDs generated (or existing if already activated)
 */
export async function activateWeek(
  leagueId: string,
  weekNumber: number,
  _activatedByUserId: string
): Promise<{ matchIds: string[] }> {
  // Import match factory dynamically to avoid circular imports
  const { generateMatchDocsForWeek } = await import('./boxLeagueMatchFactory');

  // Use transaction for atomic reads + writes
  const result = await runTransaction(db, async (transaction) => {
    // Read week doc inside transaction
    const weekRef = getWeekDoc(leagueId, weekNumber);
    const weekSnap = await transaction.get(weekRef);

    if (!weekSnap.exists()) {
      throw new Error(`Week ${weekNumber} not found`);
    }

    const week = weekSnap.data() as BoxLeagueWeek;

    // IDEMPOTENCY CHECK: If already active with matches, return existing
    if (week.state !== 'draft') {
      if (week.state === 'active' && week.matchIds && week.matchIds.length > 0) {
        console.log(`[activateWeek] Week ${weekNumber} already active, returning existing ${week.matchIds.length} matchIds`);
        return { matchIds: week.matchIds, alreadyActive: true, seasonId: week.seasonId };
      }
      throw new Error(`Week ${weekNumber} is in '${week.state}' state, expected 'draft'`);
    }

    // Edge case: Draft but has matchIds (shouldn't happen, but handle it)
    if (week.matchIds && week.matchIds.length > 0) {
      throw new Error(`Week ${weekNumber} is draft but already has ${week.matchIds.length} matches. Clear matches first or use existing.`);
    }

    // V07.40: PROMOTION FIX - Compute correct assignments for Week 2+
    let assignmentsToUse = week.boxAssignments;
    let assignmentsWereUpdated = false;

    if (weekNumber > 1) {
      // Read previous week inside the transaction
      const prevRef = getWeekDoc(leagueId, weekNumber - 1);
      const prevSnap = await transaction.get(prevRef);
      const prevWeek = prevSnap.exists() ? (prevSnap.data() as BoxLeagueWeek) : null;

      if (prevWeek?.state === 'finalized' && prevWeek.standingsSnapshot?.boxes?.length) {
        console.log(`[activateWeek] Week ${weekNumber}: Computing correct assignments from Week ${weekNumber - 1} standings`);

        // Import promotion functions
        const { applyMovements, generateNextWeekAssignments } = await import('./boxLeaguePromotion');

        // Use current week's rulesSnapshot, falling back to prevWeek's
        const rules = week.rulesSnapshot ?? prevWeek.rulesSnapshot;
        const prevForMovements: BoxLeagueWeek = { ...prevWeek, rulesSnapshot: rules };

        // Calculate movements from finalized standings
        const movements = applyMovements(prevForMovements, prevWeek.standingsSnapshot.boxes);

        // Generate correct next week assignments
        const correctAssignments = generateNextWeekAssignments(prevWeek.boxAssignments, movements);
        assignmentsToUse = correctAssignments;

        // Check if assignments differ from what's stored in week doc
        if (!deepEqualBoxAssignments(week.boxAssignments, correctAssignments)) {
          console.log(`[activateWeek] Week ${weekNumber}: Assignments differ, updating in transaction`);
          assignmentsWereUpdated = true;
        }
      }
    }

    // Generate match docs using the CORRECT assignments
    const rotationVersion = 1;
    const matchDocs = await generateMatchDocsForWeek(leagueId, week, rotationVersion, assignmentsToUse);

    console.log(`[activateWeek] Generated ${matchDocs.length} match docs for week ${weekNumber}`);

    // Write all match documents
    const matchIds: string[] = [];
    for (const matchDoc of matchDocs) {
      const matchRef = doc(db, 'leagues', leagueId, 'matches', matchDoc.id);
      transaction.set(matchRef, matchDoc.data);
      matchIds.push(matchDoc.id);
    }

    // Build the update object
    const now = Date.now();

    // If assignments were corrected, include them in the update (atomically)
    if (assignmentsWereUpdated) {
      console.log(`[activateWeek] Week ${weekNumber}: Including corrected boxAssignments in update`);
      transaction.update(weekRef, {
        state: 'active' as BoxWeekState,
        activatedAt: now,
        matchIds,
        totalMatches: matchIds.length,
        completedMatches: 0,
        pendingVerificationCount: 0,
        disputedCount: 0,
        weekStatus: 'active',
        rotationVersion,
        boxAssignments: assignmentsToUse,
      });
    } else {
      // Update week document atomically (without changing boxAssignments)
      transaction.update(weekRef, {
        state: 'active' as BoxWeekState,
        activatedAt: now,
        matchIds,
        totalMatches: matchIds.length,
        completedMatches: 0,
        pendingVerificationCount: 0,
        disputedCount: 0,
        weekStatus: 'active',
        rotationVersion,
      });
    }

    return { matchIds, alreadyActive: false, seasonId: week.seasonId };
  });

  // If we actually activated (not just returned existing), update season
  if (!result.alreadyActive) {
    await markWeekActive(leagueId, result.seasonId, weekNumber);
    console.log(`[activateWeek] Week ${weekNumber} activated with ${result.matchIds.length} matches`);
  }

  return { matchIds: result.matchIds };
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

/**
 * V07.36: Recalculate standings for a week without finalizing
 *
 * Use this during active weeks to update standings display.
 * Does NOT apply movements or create next week.
 *
 * V07.37: Now refreshes tiebreakers from current league settings
 */
export async function recalculateWeekStandings(
  leagueId: string,
  weekNumber: number
): Promise<BoxLeagueWeek['standingsSnapshot']> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // V07.37: Fetch current league settings to get latest tiebreakers and promotion/relegation counts
  const { getLeague } = await import('../firebase/leagues');
  const league = await getLeague(leagueId);

  // Update week's rulesSnapshot with current settings from league
  if (week.rulesSnapshot) {
    // Update tiebreakers
    if (league?.settings?.tiebreakers) {
      week.rulesSnapshot.tiebreakers = league.settings.tiebreakers;
      console.log(`[recalculateWeekStandings] Using current league tiebreakers:`, league.settings.tiebreakers);
    }
    // V07.38: Update promotion/relegation counts from rotatingDoublesBox settings
    const boxSettings = league?.settings?.rotatingDoublesBox?.settings;
    if (boxSettings?.promotionCount !== undefined) {
      week.rulesSnapshot.promotionCount = boxSettings.promotionCount;
      console.log(`[recalculateWeekStandings] Using current promotionCount:`, boxSettings.promotionCount);
    }
    if (boxSettings?.relegationCount !== undefined) {
      week.rulesSnapshot.relegationCount = boxSettings.relegationCount;
      console.log(`[recalculateWeekStandings] Using current relegationCount:`, boxSettings.relegationCount);
    }
  }

  // Import services dynamically to avoid circular imports
  const { calculateWeekStandings, createStandingsSnapshot } = await import(
    './boxLeagueStandings'
  );

  // Calculate standings from match results
  const standings = await calculateWeekStandings(leagueId, week);

  // Create standings snapshot
  const standingsSnapshot = await createStandingsSnapshot(week, standings);

  // Update week with new standings AND refreshed rulesSnapshot (but don't change state)
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    standingsSnapshot,
    rulesSnapshot: week.rulesSnapshot, // Save updated tiebreakers
  });

  console.log(`[recalculateWeekStandings] Week ${weekNumber} standings updated`);

  return standingsSnapshot;
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
 * V07.38: Refresh draft week box assignments from previous week standings
 *
 * Re-applies promotion/relegation using CURRENT league settings.
 * Use this when settings changed after finalization.
 */
export async function refreshDraftWeekAssignments(
  leagueId: string,
  weekNumber: number
): Promise<{ movements: PlayerMovement[]; boxAssignments: BoxAssignment[] }> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state !== 'draft') {
    throw new Error('Can only refresh box assignments for draft weeks');
  }

  if (weekNumber < 2) {
    throw new Error('Cannot refresh Week 1 - no previous week to base assignments on');
  }

  // Get previous week
  const previousWeek = await getWeek(leagueId, weekNumber - 1);
  if (!previousWeek || previousWeek.state !== 'finalized') {
    throw new Error(`Previous week (${weekNumber - 1}) must be finalized`);
  }

  if (!previousWeek.standingsSnapshot?.boxes) {
    throw new Error(`Previous week has no standings snapshot`);
  }

  // Import services
  const { getLeague } = await import('../firebase/leagues');
  const { applyMovements, generateNextWeekAssignments } = await import('./boxLeaguePromotion');

  // Get current league settings for promotion/relegation counts
  const league = await getLeague(leagueId);
  const boxSettings = league?.settings?.rotatingDoublesBox?.settings;

  // Create a modified previous week with current settings for movement calculation
  const promotionCount = boxSettings?.promotionCount ?? previousWeek.rulesSnapshot.promotionCount ?? 1;
  const relegationCount = boxSettings?.relegationCount ?? previousWeek.rulesSnapshot.relegationCount ?? 1;

  console.log(`[refreshDraftWeekAssignments] Using promotionCount=${promotionCount}, relegationCount=${relegationCount}`);
  console.log(`[refreshDraftWeekAssignments] Previous week standings:`, previousWeek.standingsSnapshot.boxes.map(s => ({
    playerId: s.playerId,
    playerName: s.playerName,
    box: s.boxNumber,
    pos: s.positionInBox
  })));

  const weekWithCurrentSettings: BoxLeagueWeek = {
    ...previousWeek,
    rulesSnapshot: {
      ...previousWeek.rulesSnapshot,
      promotionCount,
      relegationCount,
    },
  };

  // Re-apply movements with current settings
  const movements = applyMovements(weekWithCurrentSettings, previousWeek.standingsSnapshot.boxes);

  console.log(`[refreshDraftWeekAssignments] Calculated movements:`, movements.map(m => ({
    player: m.playerName,
    from: m.fromBox,
    to: m.toBox,
    reason: m.reason
  })));

  // Generate new box assignments
  const newAssignments = generateNextWeekAssignments(previousWeek.boxAssignments, movements);

  console.log(`[refreshDraftWeekAssignments] New assignments:`, newAssignments.map(a => ({
    box: a.boxNumber,
    players: a.playerIds
  })));

  // Update the draft week with new assignments
  await updateBoxAssignments(leagueId, weekNumber, newAssignments);

  // Also update the rulesSnapshot with current settings
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    rulesSnapshot: {
      ...week.rulesSnapshot,
      promotionCount: boxSettings?.promotionCount ?? 1,
      relegationCount: boxSettings?.relegationCount ?? 1,
      tiebreakers: league?.settings?.tiebreakers ?? week.rulesSnapshot?.tiebreakers,
    },
  });

  // Recalculate standings to update the display (the standingsSnapshot)
  // This will create standings entries for the new box assignments
  await recalculateWeekStandings(leagueId, weekNumber);

  console.log(`[refreshDraftWeekAssignments] Week ${weekNumber} assignments refreshed with ${movements.filter(m => m.reason !== 'stayed').length} movements`);

  return { movements, boxAssignments: newAssignments };
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
