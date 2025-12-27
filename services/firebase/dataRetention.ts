/**
 * Data Retention Service - Privacy Act 2020 Compliance
 *
 * Manages data retention policies and provides utilities for
 * tracking data lifecycle in accordance with privacy requirements.
 *
 * FILE LOCATION: services/firebase/dataRetention.ts
 * VERSION: V06.04
 */

import {
  doc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from '@firebase/firestore';
import { httpsCallable } from '@firebase/functions';
import { db, functions } from './config';

// ============================================
// TYPES
// ============================================

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  dataType: string;
  retentionPeriodDays: number;
  action: 'delete' | 'anonymize' | 'archive';
  enabled: boolean;
}

export interface DataRetentionLog {
  id: string;
  runAt: number;
  results: {
    courtBookings: number;
    meetupRsvps: number;
    inactiveUsersMarked: number;
  };
  policies: {
    courtBookingsRetentionDays: number;
    meetupRsvpRetentionDays: number;
    inactiveUserRetentionYears: number;
  };
}

export interface CleanupResult {
  success: boolean;
  dryRun: boolean;
  counts: {
    oldCourtBookings: number;
    inactiveUsers: number;
  };
  message: string;
}

// ============================================
// DEFAULT RETENTION POLICIES
// ============================================

export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    id: 'court_bookings',
    name: 'Court Bookings',
    description: 'Completed court bookings are deleted after 1 year',
    dataType: 'court_bookings',
    retentionPeriodDays: 365,
    action: 'delete',
    enabled: true,
  },
  {
    id: 'meetup_rsvps',
    name: 'Meetup RSVPs',
    description: 'Meetup RSVPs are anonymized after 6 months',
    dataType: 'meetup_rsvps',
    retentionPeriodDays: 180,
    action: 'anonymize',
    enabled: true,
  },
  {
    id: 'inactive_users',
    name: 'Inactive Users',
    description: 'Users with no login for 3 years are marked for deletion review',
    dataType: 'users',
    retentionPeriodDays: 1095, // 3 years
    action: 'archive',
    enabled: true,
  },
  {
    id: 'tournament_results',
    name: 'Tournament Results',
    description: 'Tournament results are kept indefinitely for historical records',
    dataType: 'tournament_results',
    retentionPeriodDays: -1, // Indefinite
    action: 'archive',
    enabled: true,
  },
  {
    id: 'payment_records',
    name: 'Payment Records',
    description: 'Payment records are kept for 7 years for tax compliance',
    dataType: 'payments',
    retentionPeriodDays: 2555, // 7 years
    action: 'archive',
    enabled: true,
  },
];

// ============================================
// DATA RETENTION FUNCTIONS
// ============================================

/**
 * Get all retention policies
 */
export const getRetentionPolicies = (): RetentionPolicy[] => {
  return DEFAULT_RETENTION_POLICIES;
};

/**
 * Get retention policy by data type
 */
export const getRetentionPolicyByType = (dataType: string): RetentionPolicy | undefined => {
  return DEFAULT_RETENTION_POLICIES.find(p => p.dataType === dataType);
};

/**
 * Get data retention logs (admin only)
 */
export const getDataRetentionLogs = async (
  limitCount: number = 20
): Promise<DataRetentionLog[]> => {
  const q = query(
    collection(db, 'data_retention_logs'),
    orderBy('runAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as DataRetentionLog[];
};

/**
 * Run data cleanup (dry run by default)
 * Calls the Cloud Function
 */
export const runDataCleanup = async (dryRun: boolean = true): Promise<CleanupResult> => {
  const runCleanup = httpsCallable<{ dryRun: boolean }, CleanupResult>(
    functions,
    'privacy_runDataCleanup'
  );

  const result = await runCleanup({ dryRun });
  return result.data;
};

/**
 * Calculate when data will be eligible for cleanup
 */
export const calculateRetentionDate = (
  createdAt: number,
  retentionPeriodDays: number
): Date | null => {
  if (retentionPeriodDays < 0) return null; // Indefinite retention

  const retentionMs = retentionPeriodDays * 24 * 60 * 60 * 1000;
  return new Date(createdAt + retentionMs);
};

/**
 * Check if data is eligible for cleanup
 */
export const isEligibleForCleanup = (
  createdAt: number,
  retentionPeriodDays: number
): boolean => {
  if (retentionPeriodDays < 0) return false; // Indefinite retention

  const retentionMs = retentionPeriodDays * 24 * 60 * 60 * 1000;
  return Date.now() > createdAt + retentionMs;
};

/**
 * Get users marked for deletion
 */
export const getUsersMarkedForDeletion = async (
  limitCount: number = 50
): Promise<Array<{
  id: string;
  email: string;
  displayName: string;
  markedAt: number;
  reason: string;
}>> => {
  const q = query(
    collection(db, 'users'),
    where('markedForDeletion', '==', true),
    orderBy('markedForDeletionAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      email: data.email || '',
      displayName: data.displayName || 'Unknown',
      markedAt: data.markedForDeletionAt || 0,
      reason: data.markedForDeletionReason || 'Unknown',
    };
  });
};

// ============================================
// DATA SUMMARY FUNCTIONS
// ============================================

/**
 * Get summary of user's data (for data export/portability)
 */
export const getUserDataSummary = async (userId: string): Promise<{
  profile: boolean;
  registrations: number;
  leagueMemberships: number;
  meetupRsvps: number;
  courtBookings: number;
  matchResults: number;
}> => {
  const summary = {
    profile: false,
    registrations: 0,
    leagueMemberships: 0,
    meetupRsvps: 0,
    courtBookings: 0,
    matchResults: 0,
  };

  // Check profile
  const { getDoc } = await import('@firebase/firestore');
  const profileDoc = await getDoc(doc(db, 'users', userId));
  summary.profile = profileDoc.exists();

  // Count registrations
  const regsQuery = query(
    collection(db, 'tournament_registrations'),
    where('userId', '==', userId)
  );
  const regsSnapshot = await getDocs(regsQuery);
  summary.registrations = regsSnapshot.size;

  // Count league memberships
  const leaguesQuery = query(
    collection(db, 'league_members'),
    where('userId', '==', userId)
  );
  const leaguesSnapshot = await getDocs(leaguesQuery);
  summary.leagueMemberships = leaguesSnapshot.size;

  // Count meetup RSVPs
  const meetupsQuery = query(
    collection(db, 'meetup_rsvps'),
    where('userId', '==', userId)
  );
  const meetupsSnapshot = await getDocs(meetupsQuery);
  summary.meetupRsvps = meetupsSnapshot.size;

  return summary;
};

/**
 * Format retention period for display
 */
export const formatRetentionPeriod = (days: number): string => {
  if (days < 0) return 'Kept indefinitely';
  if (days === 0) return 'Deleted immediately';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
};
