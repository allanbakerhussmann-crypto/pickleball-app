/**
 * Box League Attendance Service
 *
 * Handles player check-in flow and no-show tracking.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueAttendance.ts
 * VERSION: V07.25
 */

import { doc, updateDoc } from '@firebase/firestore';
import { db } from '../firebase/config';
import type {
  BoxLeagueWeek,
  PlayerAttendance,
  AttendanceStatus,
} from '../../types/rotatingDoublesBox';
import { getWeek } from './boxLeagueWeek';

// ============================================
// CHECK-IN OPERATIONS
// ============================================

/**
 * Check in a player
 *
 * @param selfCheckIn - If true, player is checking themselves in
 */
export async function checkInPlayer(
  leagueId: string,
  weekNumber: number,
  playerId: string,
  checkedInByUserId: string,
  selfCheckIn: boolean = true
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can only check in during draft or active states
  if (week.state !== 'draft' && week.state !== 'active') {
    throw new Error(`Cannot check in during ${week.state} state`);
  }

  // If attendance is locked, only organizer can check in
  if (week.attendanceLocked && selfCheckIn) {
    throw new Error('Attendance is locked. Contact the organizer.');
  }

  // Update attendance
  const now = Date.now();
  const updatedAttendance = week.attendance.map((a) =>
    a.playerId === playerId
      ? {
          ...a,
          status: 'checked_in' as AttendanceStatus,
          checkedInAt: now,
          checkedInByUserId,
        }
      : a
  );

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    attendance: updatedAttendance,
  });
}

/**
 * Mark a player as no-show
 *
 * Only organizer can mark no-shows
 */
export async function markNoShow(
  leagueId: string,
  weekNumber: number,
  playerId: string,
  _markedByUserId: string
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can only mark no-show during active or closing states
  if (week.state !== 'active' && week.state !== 'closing') {
    throw new Error(`Cannot mark no-show during ${week.state} state`);
  }

  // Update attendance
  const now = Date.now();
  const updatedAttendance = week.attendance.map((a) =>
    a.playerId === playerId
      ? {
          ...a,
          status: 'no_show' as AttendanceStatus,
          noShowMarkedAt: now,
        }
      : a
  );

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    attendance: updatedAttendance,
  });
}

/**
 * Mark a player as excused (organizer override)
 */
export async function markExcused(
  leagueId: string,
  weekNumber: number,
  playerId: string,
  reason: string
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state === 'finalized') {
    throw new Error('Cannot modify attendance after finalization');
  }

  // Update attendance
  const updatedAttendance = week.attendance.map((a) =>
    a.playerId === playerId
      ? {
          ...a,
          status: 'excused' as AttendanceStatus,
          excuseReason: reason,
        }
      : a
  );

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    attendance: updatedAttendance,
  });
}

// ============================================
// ATTENDANCE LOCKING
// ============================================

/**
 * Lock attendance (prevents further self-check-in)
 */
export async function lockAttendance(
  leagueId: string,
  weekNumber: number
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state === 'finalized') {
    throw new Error('Week is already finalized');
  }

  const now = Date.now();
  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    attendanceLocked: true,
    attendanceLockedAt: now,
  });
}

/**
 * Unlock attendance (organizer can unlock if needed)
 */
export async function unlockAttendance(
  leagueId: string,
  weekNumber: number
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  if (week.state === 'finalized') {
    throw new Error('Cannot unlock after finalization');
  }

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    attendanceLocked: false,
    attendanceLockedAt: null,
  });
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if a box can start (minimum players checked in)
 *
 * Need at least 4 players to run a box
 */
export function canStartBox(
  week: BoxLeagueWeek,
  boxNumber: number
): { canStart: boolean; checkedIn: number; required: number } {
  const boxAssignment = week.boxAssignments.find(
    (b) => b.boxNumber === boxNumber
  );

  if (!boxAssignment) {
    return { canStart: false, checkedIn: 0, required: 4 };
  }

  const checkedIn = boxAssignment.playerIds.filter((playerId) => {
    const attendance = week.attendance.find((a) => a.playerId === playerId);
    return attendance?.status === 'checked_in';
  }).length;

  return {
    canStart: checkedIn >= 4,
    checkedIn,
    required: 4,
  };
}

/**
 * Check if all boxes can start
 */
export function canStartAllBoxes(
  week: BoxLeagueWeek
): { canStart: boolean; blockedBoxes: number[] } {
  const blockedBoxes: number[] = [];

  for (const boxAssignment of week.boxAssignments) {
    const result = canStartBox(week, boxAssignment.boxNumber);
    if (!result.canStart) {
      blockedBoxes.push(boxAssignment.boxNumber);
    }
  }

  return {
    canStart: blockedBoxes.length === 0,
    blockedBoxes,
  };
}

// ============================================
// ATTENDANCE QUERIES
// ============================================

/**
 * Get attendance summary for a week
 */
export function getAttendanceSummary(week: BoxLeagueWeek): {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  noShow: number;
  excused: number;
} {
  return {
    total: week.attendance.length,
    checkedIn: week.attendance.filter((a) => a.status === 'checked_in').length,
    notCheckedIn: week.attendance.filter((a) => a.status === 'not_checked_in')
      .length,
    noShow: week.attendance.filter((a) => a.status === 'no_show').length,
    excused: week.attendance.filter((a) => a.status === 'excused').length,
  };
}

/**
 * Get attendance for a specific box
 */
export function getBoxAttendance(
  week: BoxLeagueWeek,
  boxNumber: number
): PlayerAttendance[] {
  const boxAssignment = week.boxAssignments.find(
    (b) => b.boxNumber === boxNumber
  );

  if (!boxAssignment) {
    return [];
  }

  return week.attendance.filter((a) =>
    boxAssignment.playerIds.includes(a.playerId)
  );
}

/**
 * Get players who haven't checked in
 */
export function getNotCheckedIn(week: BoxLeagueWeek): PlayerAttendance[] {
  return week.attendance.filter((a) => a.status === 'not_checked_in');
}

/**
 * Get no-show players
 */
export function getNoShows(week: BoxLeagueWeek): PlayerAttendance[] {
  return week.attendance.filter((a) => a.status === 'no_show');
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format attendance status for display
 */
export function formatAttendanceStatus(status: AttendanceStatus): string {
  switch (status) {
    case 'checked_in':
      return '✓ Checked In';
    case 'not_checked_in':
      return '○ Not Checked In';
    case 'no_show':
      return '✗ No Show';
    case 'excused':
      return '⊘ Excused';
    default:
      return 'Unknown';
  }
}

/**
 * Format attendance summary for display
 */
export function formatAttendanceSummary(week: BoxLeagueWeek): string {
  const summary = getAttendanceSummary(week);
  return `${summary.checkedIn}/${summary.total} checked in | ${summary.noShow} no-shows | ${summary.excused} excused`;
}

// ============================================
// HELPER
// ============================================

function getWeekDoc(leagueId: string, weekNumber: number) {
  return doc(db, 'leagues', leagueId, 'boxWeeks', weekNumber.toString());
}
