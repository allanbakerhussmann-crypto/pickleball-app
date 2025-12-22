/**
 * League Postpone Service V05.37
 * 
 * Firebase functions for postponing and rescheduling league matches.
 * Handles both individual match postponements and bulk week postponements.
 * 
 * FILE LOCATION: src/services/firebase/leaguePostpone.ts
 * VERSION: V05.37
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type {
  LeagueMatch,
  LeagueWeekPostponement,
  PostponeReason,
} from '../../types';

// ============================================
// TYPES
// ============================================

export interface PostponeMatchInput {
  leagueId: string;
  matchId: string;
  reason: PostponeReason | string;
  makeupDeadlineDays?: number;
  postponedByUserId: string;
  postponedByName: string;
}

export interface RescheduleMatchInput {
  leagueId: string;
  matchId: string;
  newDate: number;
  newStartTime?: string | null;
  newEndTime?: string | null;
  newCourt?: string | null;
}

export interface PostponeWeekInput {
  leagueId: string;
  divisionId?: string | null;
  weekNumber: number;
  roundNumber?: number | null;
  originalDate: number;
  reason: string;
  makeupDeadlineDays?: number;
  postponedByUserId: string;
  postponedByName: string;
}

export interface RescheduleWeekInput {
  leagueId: string;
  postponementId: string;
  newDate: number;
  newStartTime?: string | null;
  newEndTime?: string | null;
}

// ============================================
// SINGLE MATCH POSTPONEMENT
// ============================================

/**
 * Postpone a single match
 * 
 * Changes match status to 'postponed' and records details.
 * The match can later be rescheduled or cancelled.
 */
export const postponeMatch = async (
  input: PostponeMatchInput
): Promise<void> => {
  const { leagueId, matchId, reason, makeupDeadlineDays, postponedByUserId, postponedByName } = input;
  
  const matchRef = doc(db, 'leagues', leagueId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  
  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }
  
  const match = matchSnap.data() as LeagueMatch;
  
  // Can only postpone scheduled matches
  if (match.status !== 'scheduled') {
    throw new Error(`Cannot postpone match with status: ${match.status}`);
  }
  
  const now = Date.now();
  
  // Calculate makeup deadline (default 14 days)
  const deadlineDays = makeupDeadlineDays || 14;
  const makeupDeadline = now + (deadlineDays * 24 * 60 * 60 * 1000);
  
  await updateDoc(matchRef, {
    status: 'postponed',
    postponedAt: now,
    postponedByUserId,
    postponedByName,
    postponedReason: reason,
    originalScheduledDate: match.scheduledDate || null,
    makeupDeadline,
    // Clear current scheduling
    scheduledDate: null,
    court: null,
    startTime: null,
    endTime: null,
  });
};

/**
 * Reschedule a postponed match to a new date/time
 * 
 * Changes match status back to 'scheduled' with new date.
 */
export const rescheduleMatch = async (
  input: RescheduleMatchInput
): Promise<void> => {
  const { leagueId, matchId, newDate, newStartTime, newEndTime, newCourt } = input;
  
  const matchRef = doc(db, 'leagues', leagueId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  
  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }
  
  const match = matchSnap.data() as LeagueMatch;
  
  // Can only reschedule postponed matches
  if (match.status !== 'postponed') {
    throw new Error(`Cannot reschedule match with status: ${match.status}. Match must be postponed first.`);
  }
  
  await updateDoc(matchRef, {
    status: 'scheduled',
    scheduledDate: newDate,
    rescheduledTo: newDate,
    rescheduledCourt: newCourt || null,
    startTime: newStartTime || null,
    endTime: newEndTime || null,
    court: newCourt || null,
  });
};

/**
 * Cancel a postponed match (when it can't be rescheduled)
 * 
 * This is different from forfeit - neither player is penalized.
 */
export const cancelPostponedMatch = async (
  leagueId: string,
  matchId: string,
  _cancelledByUserId: string,
  reason?: string
): Promise<void> => {
  const matchRef = doc(db, 'leagues', leagueId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  
  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }
  
  const match = matchSnap.data() as LeagueMatch;
  
  // Can only cancel postponed matches through this function
  if (match.status !== 'postponed') {
    throw new Error(`Cannot cancel match with status: ${match.status}. Use this only for postponed matches.`);
  }
  
  await updateDoc(matchRef, {
    status: 'cancelled',
    disputeReason: reason || 'Postponed match could not be rescheduled',
    completedAt: Date.now(),
  });
};

// ============================================
// WEEK/ROUND POSTPONEMENT
// ============================================

/**
 * Postpone an entire week of matches
 * 
 * Creates a LeagueWeekPostponement record and updates all matches
 * in that week to postponed status.
 */
export const postponeWeek = async (
  input: PostponeWeekInput
): Promise<string> => {
  const {
    leagueId,
    divisionId,
    weekNumber,
    roundNumber,
    originalDate,
    reason,
    makeupDeadlineDays,
    postponedByUserId,
    postponedByName,
  } = input;
  
  const now = Date.now();
  
  // Find all scheduled matches for this week
  const matchQuery = query(
    collection(db, 'leagues', leagueId, 'matches'),
    where('weekNumber', '==', weekNumber),
    where('status', '==', 'scheduled')
  );
  
  const matchSnap = await getDocs(matchQuery);
  
  // Filter by division if specified (client-side to avoid index)
  let matchesToPostpone = matchSnap.docs.map(d => ({
    ...d.data() as LeagueMatch,
    id: d.id,
  }));
  
  if (divisionId) {
    matchesToPostpone = matchesToPostpone.filter(m => m.divisionId === divisionId);
  }
  
  if (roundNumber) {
    matchesToPostpone = matchesToPostpone.filter(m => m.roundNumber === roundNumber);
  }
  
  if (matchesToPostpone.length === 0) {
    throw new Error('No scheduled matches found for this week');
  }
  
  // Calculate makeup deadline (default 21 days for week postponement)
  const deadlineDays = makeupDeadlineDays || 21;
  const makeupDeadline = now + (deadlineDays * 24 * 60 * 60 * 1000);
  
  // Create the week postponement record
  const postponementRef = doc(collection(db, 'leagues', leagueId, 'postponements'));
  const postponementId = postponementRef.id;
  
  const postponement: LeagueWeekPostponement = {
    id: postponementId,
    leagueId,
    divisionId: divisionId || null,
    weekNumber,
    roundNumber: roundNumber || null,
    originalDate,
    reason,
    rescheduledTo: null,
    makeupDeadline,
    status: 'postponed',
    affectedMatchIds: matchesToPostpone.map(m => m.id),
    affectedMatchCount: matchesToPostpone.length,
    postponedByUserId,
    postponedByName,
    createdAt: now,
    updatedAt: now,
  };
  
  // Use batch to update all matches and create postponement record
  const batch = writeBatch(db);
  
  // Add postponement record
  batch.set(postponementRef, postponement);
  
  // Update all matches
  for (const match of matchesToPostpone) {
    const matchRef = doc(db, 'leagues', leagueId, 'matches', match.id);
    batch.update(matchRef, {
      status: 'postponed',
      postponedAt: now,
      postponedByUserId,
      postponedByName,
      postponedReason: reason,
      originalScheduledDate: match.scheduledDate || originalDate,
      makeupDeadline,
      weekPostponementId: postponementId,
      // Clear current scheduling
      scheduledDate: null,
      court: null,
      startTime: null,
      endTime: null,
    });
  }
  
  await batch.commit();
  
  return postponementId;
};

/**
 * Reschedule an entire postponed week
 * 
 * Updates the postponement record and all affected matches.
 */
export const rescheduleWeek = async (
  input: RescheduleWeekInput
): Promise<void> => {
  const { leagueId, postponementId, newDate, newStartTime, newEndTime } = input;
  
  const postponementRef = doc(db, 'leagues', leagueId, 'postponements', postponementId);
  const postponementSnap = await getDoc(postponementRef);
  
  if (!postponementSnap.exists()) {
    throw new Error('Week postponement record not found');
  }
  
  const postponement = postponementSnap.data() as LeagueWeekPostponement;
  
  if (postponement.status !== 'postponed') {
    throw new Error(`Cannot reschedule week with status: ${postponement.status}`);
  }
  
  const now = Date.now();
  const batch = writeBatch(db);
  
  // Update postponement record
  batch.update(postponementRef, {
    status: 'rescheduled',
    rescheduledTo: newDate,
    updatedAt: now,
  });
  
  // Update all affected matches
  for (const matchId of postponement.affectedMatchIds) {
    const matchRef = doc(db, 'leagues', leagueId, 'matches', matchId);
    batch.update(matchRef, {
      status: 'scheduled',
      scheduledDate: newDate,
      rescheduledTo: newDate,
      startTime: newStartTime || null,
      endTime: newEndTime || null,
    });
  }
  
  await batch.commit();
};

/**
 * Cancel an entire postponed week (when it can't be rescheduled)
 */
export const cancelPostponedWeek = async (
  leagueId: string,
  postponementId: string,
  reason?: string
): Promise<void> => {
  const postponementRef = doc(db, 'leagues', leagueId, 'postponements', postponementId);
  const postponementSnap = await getDoc(postponementRef);
  
  if (!postponementSnap.exists()) {
    throw new Error('Week postponement record not found');
  }
  
  const postponement = postponementSnap.data() as LeagueWeekPostponement;
  
  if (postponement.status !== 'postponed') {
    throw new Error(`Cannot cancel week with status: ${postponement.status}`);
  }
  
  const now = Date.now();
  const batch = writeBatch(db);
  
  // Update postponement record
  batch.update(postponementRef, {
    status: 'cancelled',
    updatedAt: now,
  });
  
  // Update all affected matches
  for (const matchId of postponement.affectedMatchIds) {
    const matchRef = doc(db, 'leagues', leagueId, 'matches', matchId);
    batch.update(matchRef, {
      status: 'cancelled',
      disputeReason: reason || 'Week cancelled - could not be rescheduled',
      completedAt: now,
    });
  }
  
  await batch.commit();
};

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get all postponed matches for a league
 */
export const getPostponedMatches = async (
  leagueId: string,
  divisionId?: string | null
): Promise<LeagueMatch[]> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'matches'),
    where('status', '==', 'postponed'),
    orderBy('postponedAt', 'desc')
  );
  
  const snap = await getDocs(q);
  let matches = snap.docs.map(d => d.data() as LeagueMatch);
  
  // Filter by division if specified
  if (divisionId) {
    matches = matches.filter(m => m.divisionId === divisionId);
  }
  
  return matches;
};

/**
 * Get all week postponements for a league
 */
export const getWeekPostponements = async (
  leagueId: string,
  status?: 'postponed' | 'rescheduled' | 'cancelled'
): Promise<LeagueWeekPostponement[]> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'postponements'),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  let postponements = snap.docs.map(d => d.data() as LeagueWeekPostponement);
  
  // Filter by status if specified
  if (status) {
    postponements = postponements.filter(p => p.status === status);
  }
  
  return postponements;
};

/**
 * Get matches that need rescheduling (postponed but not yet rescheduled)
 */
export const getMatchesNeedingReschedule = async (
  leagueId: string,
  divisionId?: string | null
): Promise<LeagueMatch[]> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'matches'),
    where('status', '==', 'postponed'),
    orderBy('makeupDeadline', 'asc')
  );
  
  const snap = await getDocs(q);
  let matches = snap.docs.map(d => d.data() as LeagueMatch);
  
  // Filter by division if specified
  if (divisionId) {
    matches = matches.filter(m => m.divisionId === divisionId);
  }
  
  // Only return matches that haven't been linked to a week postponement
  // (those are managed separately)
  return matches.filter(m => !m.weekPostponementId);
};

/**
 * Get matches with overdue makeup deadlines
 */
export const getOverdueMakeupMatches = async (
  leagueId: string
): Promise<LeagueMatch[]> => {
  const now = Date.now();
  
  const q = query(
    collection(db, 'leagues', leagueId, 'matches'),
    where('status', '==', 'postponed')
  );
  
  const snap = await getDocs(q);
  const matches = snap.docs.map(d => d.data() as LeagueMatch);
  
  // Filter to only overdue matches
  return matches.filter(m => m.makeupDeadline && m.makeupDeadline < now);
};

/**
 * Get a single week postponement by ID
 */
export const getWeekPostponement = async (
  leagueId: string,
  postponementId: string
): Promise<LeagueWeekPostponement | null> => {
  const docSnap = await getDoc(doc(db, 'leagues', leagueId, 'postponements', postponementId));
  
  if (!docSnap.exists()) return null;
  return docSnap.data() as LeagueWeekPostponement;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a match can be postponed
 */
export const canPostponeMatch = (match: LeagueMatch): { canPostpone: boolean; reason?: string } => {
  if (match.status !== 'scheduled') {
    return { 
      canPostpone: false, 
      reason: `Cannot postpone match with status: ${match.status}` 
    };
  }
  
  return { canPostpone: true };
};

/**
 * Check if a match can be rescheduled
 */
export const canRescheduleMatch = (match: LeagueMatch): { canReschedule: boolean; reason?: string } => {
  if (match.status !== 'postponed') {
    return { 
      canReschedule: false, 
      reason: `Only postponed matches can be rescheduled. Current status: ${match.status}` 
    };
  }
  
  return { canReschedule: true };
};

/**
 * Get count of postponed matches by status
 */
export const getPostponeStats = async (
  leagueId: string
): Promise<{
  postponed: number;
  rescheduled: number;
  overdue: number;
}> => {
  const now = Date.now();
  
  // Get all matches that have been postponed at some point
  const postponedQuery = query(
    collection(db, 'leagues', leagueId, 'matches'),
    where('status', '==', 'postponed')
  );
  
  const rescheduledQuery = query(
    collection(db, 'leagues', leagueId, 'matches'),
    where('status', '==', 'scheduled'),
    where('rescheduledTo', '!=', null)
  );
  
  const [postponedSnap, rescheduledSnap] = await Promise.all([
    getDocs(postponedQuery),
    getDocs(rescheduledQuery),
  ]);
  
  const postponedMatches = postponedSnap.docs.map(d => d.data() as LeagueMatch);
  const overdueCount = postponedMatches.filter(
    m => m.makeupDeadline && m.makeupDeadline < now
  ).length;
  
  return {
    postponed: postponedSnap.size,
    rescheduled: rescheduledSnap.size,
    overdue: overdueCount,
  };
};

/**
 * Format postpone reason for display
 */
export const formatPostponeReason = (reason: PostponeReason | string): string => {
  const reasonLabels: Record<PostponeReason, string> = {
    weather: '🌧️ Weather',
    venue_unavailable: '🏟️ Venue Unavailable',
    player_unavailable: '👤 Player Unavailable',
    holiday: '🎉 Holiday',
    emergency: '🚨 Emergency',
    other: '📝 Other',
  };
  
  return reasonLabels[reason as PostponeReason] || reason;
};

/**
 * Get default makeup deadline days based on reason
 */
export const getDefaultMakeupDays = (reason: PostponeReason | string): number => {
  switch (reason) {
    case 'weather':
      return 7; // Weather usually clears up within a week
    case 'venue_unavailable':
      return 14;
    case 'player_unavailable':
      return 14;
    case 'holiday':
      return 7;
    case 'emergency':
      return 21; // More time for emergencies
    default:
      return 14;
  }
};