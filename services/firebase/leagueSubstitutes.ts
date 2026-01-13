/**
 * League Substitutes Service
 *
 * Manages the substitutes table for box leagues.
 * Tracks substitute players who can fill in for absent players.
 *
 * Collection: leagues/{leagueId}/substitutes/{odUserId}
 *
 * FILE LOCATION: services/firebase/leagueSubstitutes.ts
 * VERSION: V07.44
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from '@firebase/firestore';
import { db } from './config';
import type {
  LeagueSubstitute,
  SubstitutionRecord,
  SubstituteStatus,
} from '../../types/rotatingDoublesBox/boxLeagueTypes';

// ============================================
// COLLECTION HELPERS
// ============================================

function getSubstitutesCollection(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'substitutes');
}

function getSubstituteDoc(leagueId: string, odUserId: string) {
  return doc(db, 'leagues', leagueId, 'substitutes', odUserId);
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Add a new substitute to the league
 */
export async function addSubstitute(
  leagueId: string,
  substitute: {
    odUserId: string;
    displayName: string;
    email?: string;
    phone?: string;
    duprId?: string;
    duprDoublesRating?: number;
    duprSinglesRating?: number;
    duprConsent?: boolean;
    notes?: string;
    isMember?: boolean;
  },
  addedByUserId: string
): Promise<LeagueSubstitute> {
  const now = Date.now();

  const newSub: LeagueSubstitute = {
    odUserId: substitute.odUserId,
    displayName: substitute.displayName,
    email: substitute.email,
    phone: substitute.phone,
    duprId: substitute.duprId,
    duprDoublesRating: substitute.duprDoublesRating,
    duprSinglesRating: substitute.duprSinglesRating,
    duprConsent: substitute.duprConsent,
    status: 'available',
    substitutionHistory: [],
    totalSubstitutions: 0,
    totalMatchesPlayed: 0,
    totalWins: 0,
    totalPointsFor: 0,
    totalPointsAgainst: 0,
    addedAt: now,
    addedByUserId,
    notes: substitute.notes,
    isMember: substitute.isMember,
  };

  await setDoc(getSubstituteDoc(leagueId, substitute.odUserId), newSub);

  return newSub;
}

/**
 * Get a substitute by ID
 */
export async function getSubstitute(
  leagueId: string,
  odUserId: string
): Promise<LeagueSubstitute | null> {
  const docSnap = await getDoc(getSubstituteDoc(leagueId, odUserId));

  if (!docSnap.exists()) {
    return null;
  }

  return docSnap.data() as LeagueSubstitute;
}

/**
 * Get all substitutes for a league
 */
export async function getSubstitutes(
  leagueId: string,
  options?: {
    status?: SubstituteStatus;
    hasDuprId?: boolean;
  }
): Promise<LeagueSubstitute[]> {
  let q = query(
    getSubstitutesCollection(leagueId),
    orderBy('displayName')
  );

  if (options?.status) {
    q = query(
      getSubstitutesCollection(leagueId),
      where('status', '==', options.status),
      orderBy('displayName')
    );
  }

  const snapshot = await getDocs(q);
  let subs = snapshot.docs.map((d) => d.data() as LeagueSubstitute);

  // Client-side filter for hasDuprId (can't combine inequality with orderBy on different field)
  if (options?.hasDuprId !== undefined) {
    subs = subs.filter((s) =>
      options.hasDuprId ? !!s.duprId : !s.duprId
    );
  }

  return subs;
}

/**
 * Get available substitutes for a league
 */
export async function getAvailableSubstitutes(
  leagueId: string
): Promise<LeagueSubstitute[]> {
  return getSubstitutes(leagueId, { status: 'available' });
}

/**
 * Update substitute details
 */
export async function updateSubstitute(
  leagueId: string,
  odUserId: string,
  updates: Partial<Pick<
    LeagueSubstitute,
    | 'displayName'
    | 'email'
    | 'phone'
    | 'duprId'
    | 'duprDoublesRating'
    | 'duprSinglesRating'
    | 'duprConsent'
    | 'status'
    | 'statusReason'
    | 'availableWeeks'
    | 'unavailableWeeks'
    | 'preferredBoxes'
    | 'notes'
    | 'isMember'
  >>
): Promise<void> {
  await updateDoc(getSubstituteDoc(leagueId, odUserId), updates);
}

/**
 * Remove a substitute from the league
 */
export async function removeSubstitute(
  leagueId: string,
  odUserId: string
): Promise<void> {
  await deleteDoc(getSubstituteDoc(leagueId, odUserId));
}

// ============================================
// STATUS MANAGEMENT
// ============================================

/**
 * Mark substitute as available
 */
export async function markSubstituteAvailable(
  leagueId: string,
  odUserId: string
): Promise<void> {
  await updateDoc(getSubstituteDoc(leagueId, odUserId), {
    status: 'available',
    statusReason: null,
  });
}

/**
 * Mark substitute as unavailable
 */
export async function markSubstituteUnavailable(
  leagueId: string,
  odUserId: string,
  reason?: string
): Promise<void> {
  await updateDoc(getSubstituteDoc(leagueId, odUserId), {
    status: 'unavailable',
    statusReason: reason || null,
  });
}

/**
 * Ban a substitute
 */
export async function banSubstitute(
  leagueId: string,
  odUserId: string,
  reason: string
): Promise<void> {
  await updateDoc(getSubstituteDoc(leagueId, odUserId), {
    status: 'banned',
    statusReason: reason,
  });
}

// ============================================
// SUBSTITUTION TRACKING
// ============================================

/**
 * Record a substitution event when a substitute plays
 *
 * Called when a week is finalized to update substitute stats.
 */
export async function recordSubstitution(
  leagueId: string,
  odUserId: string,
  record: SubstitutionRecord
): Promise<void> {
  const sub = await getSubstitute(leagueId, odUserId);

  if (!sub) {
    console.warn(`Substitute ${odUserId} not found in league ${leagueId}`);
    return;
  }

  const now = Date.now();
  const updatedHistory = [...sub.substitutionHistory, record];

  await updateDoc(getSubstituteDoc(leagueId, odUserId), {
    substitutionHistory: updatedHistory,
    totalSubstitutions: sub.totalSubstitutions + 1,
    totalMatchesPlayed: sub.totalMatchesPlayed + record.matchesPlayed,
    totalWins: sub.totalWins + record.wins,
    totalPointsFor: sub.totalPointsFor + record.pointsFor,
    totalPointsAgainst: sub.totalPointsAgainst + record.pointsAgainst,
    lastUsedAt: now,
  });
}

/**
 * Get substitution history for a specific substitute
 */
export async function getSubstitutionHistory(
  leagueId: string,
  odUserId: string
): Promise<SubstitutionRecord[]> {
  const sub = await getSubstitute(leagueId, odUserId);
  return sub?.substitutionHistory || [];
}

/**
 * Get all substitutions for a specific week
 */
export async function getWeekSubstitutions(
  leagueId: string,
  weekNumber: number
): Promise<Array<{ substitute: LeagueSubstitute; record: SubstitutionRecord }>> {
  const subs = await getSubstitutes(leagueId);
  const results: Array<{ substitute: LeagueSubstitute; record: SubstitutionRecord }> = [];

  for (const sub of subs) {
    const weekRecord = sub.substitutionHistory.find(
      (r) => r.weekNumber === weekNumber
    );
    if (weekRecord) {
      results.push({ substitute: sub, record: weekRecord });
    }
  }

  return results;
}

// ============================================
// AVAILABILITY MANAGEMENT
// ============================================

/**
 * Set availability for specific weeks
 */
export async function setWeekAvailability(
  leagueId: string,
  odUserId: string,
  weekNumber: number,
  available: boolean
): Promise<void> {
  const sub = await getSubstitute(leagueId, odUserId);

  if (!sub) {
    throw new Error('Substitute not found');
  }

  const availableWeeks = new Set(sub.availableWeeks || []);
  const unavailableWeeks = new Set(sub.unavailableWeeks || []);

  if (available) {
    availableWeeks.add(weekNumber);
    unavailableWeeks.delete(weekNumber);
  } else {
    unavailableWeeks.add(weekNumber);
    availableWeeks.delete(weekNumber);
  }

  await updateDoc(getSubstituteDoc(leagueId, odUserId), {
    availableWeeks: Array.from(availableWeeks).sort((a, b) => a - b),
    unavailableWeeks: Array.from(unavailableWeeks).sort((a, b) => a - b),
  });
}

/**
 * Check if substitute is available for a specific week
 */
export function isAvailableForWeek(
  substitute: LeagueSubstitute,
  weekNumber: number
): boolean {
  // Banned substitutes are never available
  if (substitute.status === 'banned') {
    return false;
  }

  // If explicitly marked unavailable for this week
  if (substitute.unavailableWeeks?.includes(weekNumber)) {
    return false;
  }

  // If generally unavailable and not explicitly available for this week
  if (
    substitute.status === 'unavailable' &&
    !substitute.availableWeeks?.includes(weekNumber)
  ) {
    return false;
  }

  return true;
}

/**
 * Get available substitutes for a specific week
 */
export async function getAvailableSubstitutesForWeek(
  leagueId: string,
  weekNumber: number,
  options?: {
    requireDuprId?: boolean;
    preferredBox?: number;
  }
): Promise<LeagueSubstitute[]> {
  const allSubs = await getSubstitutes(leagueId);

  return allSubs.filter((sub) => {
    // Check week availability
    if (!isAvailableForWeek(sub, weekNumber)) {
      return false;
    }

    // Check DUPR requirement
    if (options?.requireDuprId && !sub.duprId) {
      return false;
    }

    // If preferred box specified, filter by preference
    if (
      options?.preferredBox &&
      sub.preferredBoxes?.length &&
      !sub.preferredBoxes.includes(options.preferredBox)
    ) {
      return false;
    }

    return true;
  });
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to substitutes collection changes
 */
export function subscribeToSubstitutes(
  leagueId: string,
  callback: (subs: LeagueSubstitute[]) => void
): Unsubscribe {
  const q = query(
    getSubstitutesCollection(leagueId),
    orderBy('displayName')
  );

  return onSnapshot(q, (snapshot) => {
    const subs = snapshot.docs.map((d) => d.data() as LeagueSubstitute);
    callback(subs);
  });
}

/**
 * Subscribe to available substitutes
 */
export function subscribeToAvailableSubstitutes(
  leagueId: string,
  callback: (subs: LeagueSubstitute[]) => void
): Unsubscribe {
  const q = query(
    getSubstitutesCollection(leagueId),
    where('status', '==', 'available'),
    orderBy('displayName')
  );

  return onSnapshot(q, (snapshot) => {
    const subs = snapshot.docs.map((d) => d.data() as LeagueSubstitute);
    callback(subs);
  });
}

// ============================================
// STATS & REPORTING
// ============================================

/**
 * Get top substitutes by total games played
 */
export async function getTopSubstitutes(
  leagueId: string,
  limit: number = 10
): Promise<LeagueSubstitute[]> {
  const subs = await getSubstitutes(leagueId);

  return subs
    .filter((s) => s.totalMatchesPlayed > 0)
    .sort((a, b) => b.totalMatchesPlayed - a.totalMatchesPlayed)
    .slice(0, limit);
}

/**
 * Get substitute stats summary for a league
 */
export async function getSubstituteStats(leagueId: string): Promise<{
  totalSubstitutes: number;
  availableCount: number;
  unavailableCount: number;
  bannedCount: number;
  withDuprIdCount: number;
  totalSubstitutions: number;
  totalMatchesPlayed: number;
}> {
  const subs = await getSubstitutes(leagueId);

  return {
    totalSubstitutes: subs.length,
    availableCount: subs.filter((s) => s.status === 'available').length,
    unavailableCount: subs.filter((s) => s.status === 'unavailable').length,
    bannedCount: subs.filter((s) => s.status === 'banned').length,
    withDuprIdCount: subs.filter((s) => !!s.duprId).length,
    totalSubstitutions: subs.reduce((sum, s) => sum + s.totalSubstitutions, 0),
    totalMatchesPlayed: subs.reduce((sum, s) => sum + s.totalMatchesPlayed, 0),
  };
}

// ============================================
// UTILITY: CREATE FROM USER PROFILE
// ============================================

/**
 * Create a substitute entry from a user profile
 *
 * Useful when adding a user as a substitute from the search modal.
 */
export async function addSubstituteFromUser(
  leagueId: string,
  user: {
    odUserId: string;
    displayName: string;
    email?: string;
    phone?: string;
    duprId?: string;
    duprDoublesRating?: number;
    duprSinglesRating?: number;
  },
  addedByUserId: string,
  options?: {
    notes?: string;
    isMember?: boolean;
  }
): Promise<LeagueSubstitute> {
  // Check if already exists
  const existing = await getSubstitute(leagueId, user.odUserId);

  if (existing) {
    // Update with latest info and return
    await updateSubstitute(leagueId, user.odUserId, {
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      duprId: user.duprId,
      duprDoublesRating: user.duprDoublesRating,
      duprSinglesRating: user.duprSinglesRating,
    });

    return { ...existing, ...user };
  }

  // Create new substitute
  return addSubstitute(
    leagueId,
    {
      odUserId: user.odUserId,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      duprId: user.duprId,
      duprDoublesRating: user.duprDoublesRating,
      duprSinglesRating: user.duprSinglesRating,
      notes: options?.notes,
      isMember: options?.isMember,
    },
    addedByUserId
  );
}
