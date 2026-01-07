/**
 * User Profile and Role Management
 */

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  limit,
  where,
} from '@firebase/firestore';
import { httpsCallable } from '@firebase/functions';
import { ref, uploadBytes, getDownloadURL } from '@firebase/storage';
import { db, storage, functions } from './config';
import type { UserProfile, OrganizerAgreement } from '../../types';

// ============================================
// User Profile CRUD
// ============================================

export const createUserProfile = async (userId: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { 
    ...data, 
    id: userId, 
    createdAt: Date.now(), 
    updatedAt: Date.now() 
  }, { merge: true });
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } as UserProfile : null;
};

export const updateUserProfileDoc = async (userId: string, data: Partial<UserProfile>) => {
  await updateDoc(doc(db, 'users', userId), { ...data, updatedAt: Date.now() });
};

// Alias for consistency
export const updateUserProfile = updateUserProfileDoc;

// ============================================
// User Search
// ============================================

export const searchUsers = async (searchTerm: string): Promise<UserProfile[]> => {
  const usersRef = collection(db, 'users');
  const term = searchTerm.toLowerCase().trim();
  if (!term) return [];

  const allUsersSnap = await getDocs(query(usersRef, limit(200)));
  const users: UserProfile[] = allUsersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));

  return users.filter(u => {
    const displayNameLower = (u.displayName || '').toLowerCase();
    const emailLower = (u.email || '').toLowerCase();
    const firstNameLower = (u.firstName || '').toLowerCase();
    const lastNameLower = (u.lastName || '').toLowerCase();
    const fullName = `${firstNameLower} ${lastNameLower}`;

    return (
      displayNameLower.includes(term) ||
      emailLower.includes(term) ||
      firstNameLower.includes(term) ||
      lastNameLower.includes(term) ||
      fullName.includes(term)
    );
  });
};

export const searchEligiblePartners = async (
  searchTerm: string,
  tournamentId: string,
  divisionId: string,
  currentUserId: string
): Promise<UserProfile[]> => {
  const matchedUsers = await searchUsers(searchTerm);
  if (!matchedUsers.length) return [];

  const teamsSnap = await getDocs(
    query(
      collection(db, 'tournaments', tournamentId, 'teams'),
      where('divisionId', '==', divisionId)
    )
  );

  const playersInDivision = new Set<string>();
  teamsSnap.docs.forEach(d => {
    const t = d.data();
    if (t.status === 'active' || t.status === 'pending_partner') {
      (t.players || []).forEach((p: string) => playersInDivision.add(p));
    }
  });

  return matchedUsers.filter(u => u.id !== currentUserId && !playersInDivision.has(u.id));
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
  const snap = await getDocs(query(collection(db, 'users'), limit(limitCount)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
};

export const getUsersByIds = async (userIds: string[]): Promise<UserProfile[]> => {
  if (!userIds.length) return [];
  const promises = userIds.map(id => getDoc(doc(db, 'users', id)));
  const snaps = await Promise.all(promises);
  return snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as UserProfile));
};

// ============================================
// Profile Image Upload
// ============================================

export const uploadProfileImage = async (userId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `profile_images/${userId}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  await updateDoc(doc(db, 'users', userId), {
    photoURL: downloadURL,
    updatedAt: Date.now()
  });

  return downloadURL;
};

// ============================================
// Role Management (via Cloud Functions for security)
// ============================================

/**
 * Promote a user to App Admin
 * This calls a Cloud Function that verifies the caller is an admin
 */
export const promoteToAppAdmin = async (targetUserId: string): Promise<void> => {
  const callable = httpsCallable<{ targetUserId: string }, { success: boolean; message: string }>(
    functions,
    'admin_promoteToAppAdmin'
  );
  const result = await callable({ targetUserId });
  if (!result.data.success) {
    throw new Error(result.data.message || 'Failed to promote user to admin');
  }
};

/**
 * Demote a user from App Admin
 * This calls a Cloud Function that verifies the caller is an admin
 */
export const demoteFromAppAdmin = async (targetUserId: string, _currentUserId?: string): Promise<void> => {
  const callable = httpsCallable<{ targetUserId: string }, { success: boolean; message: string }>(
    functions,
    'admin_demoteFromAppAdmin'
  );
  const result = await callable({ targetUserId });
  if (!result.data.success) {
    throw new Error(result.data.message || 'Failed to demote user from admin');
  }
};

/**
 * Promote a user to Organizer
 * This calls a Cloud Function that verifies the caller is an admin
 */
export const promoteToOrganizer = async (targetUserId: string): Promise<void> => {
  const callable = httpsCallable<{ targetUserId: string }, { success: boolean; message: string }>(
    functions,
    'admin_promoteToOrganizer'
  );
  const result = await callable({ targetUserId });
  if (!result.data.success) {
    throw new Error(result.data.message || 'Failed to promote user to organizer');
  }
};

/**
 * Demote a user from Organizer
 * This calls a Cloud Function that verifies the caller is an admin
 */
export const demoteFromOrganizer = async (targetUserId: string): Promise<void> => {
  const callable = httpsCallable<{ targetUserId: string }, { success: boolean; message: string }>(
    functions,
    'admin_demoteFromOrganizer'
  );
  const result = await callable({ targetUserId });
  if (!result.data.success) {
    throw new Error(result.data.message || 'Failed to demote user from organizer');
  }
};

/**
 * Get admin audit logs
 * This calls a Cloud Function that verifies the caller is an admin
 */
export const getAdminAuditLogs = async (limitCount = 100): Promise<unknown[]> => {
  const callable = httpsCallable<{ limit: number }, unknown[]>(
    functions,
    'admin_getAuditLogs'
  );
  const result = await callable({ limit: limitCount });
  return result.data;
};

// Player role can still be managed locally since it's the default role
export const promoteToPlayer = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    roles: ['player'],
    updatedAt: Date.now()
  });
};

export const demoteFromPlayer = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    roles: [],
    updatedAt: Date.now()
  });
};

// ============================================
// ORGANIZER AGREEMENT (V07.05)
// ============================================

/**
 * Update organizer agreement for a user
 * Used when an existing organizer accepts a new agreement version
 * or when a new organizer's request is approved
 */
export const updateOrganizerAgreement = async (
  userId: string,
  agreement: OrganizerAgreement
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    organizerAgreement: agreement,
    organizerAgreementRequired: false,
    updatedAt: Date.now(),
  });
};

/**
 * Mark an organizer as requiring agreement re-acceptance
 * Used during migrations when agreement version changes
 */
export const markOrganizerAgreementRequired = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    organizerAgreementRequired: true,
    updatedAt: Date.now(),
  });
};