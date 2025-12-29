/**
 * Club Firebase Services
 * 
 * Database operations for clubs and memberships
 * 
 * FILE LOCATION: services/firebase/clubs.ts
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  writeBatch,
  arrayUnion,
} from '@firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from '@firebase/storage';
import { db, storage } from './config';
import type { Club, ClubJoinRequest } from '../../types';

// ============================================
// Club CRUD
// ============================================

export const createClub = async (
  club: Omit<Club, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const clubRef = doc(collection(db, 'clubs'));
  const now = Date.now();
  
  await setDoc(clubRef, {
    ...club,
    id: clubRef.id,
    members: club.members || [],
    admins: club.admins || [],
    createdAt: now,
    updatedAt: now,
  });
  
  return clubRef.id;
};

export const getClub = async (clubId: string): Promise<Club | null> => {
  const snap = await getDoc(doc(db, 'clubs', clubId));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Club : null;
};

/**
 * Update club profile
 */
export const updateClub = async (
  clubId: string,
  updates: Partial<Club>
): Promise<void> => {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    ...updates,
    updatedAt: Date.now(),
  });
};

/**
 * Upload club logo to Firebase Storage
 */
export const uploadClubLogo = async (
  clubId: string,
  file: File
): Promise<string> => {
  const ext = file.name.split('.').pop() || 'png';
  const path = `club_logos/${clubId}/logo.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
};

/**
 * Delete club logo from Firebase Storage
 */
export const deleteClubLogo = async (logoUrl: string): Promise<void> => {
  try {
    const storageRef = ref(storage, logoUrl);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Failed to delete club logo:', error);
  }
};

export const subscribeToClub = (
  clubId: string, 
  callback: (club: Club | null) => void
) => {
  return onSnapshot(doc(db, 'clubs', clubId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } as Club : null);
  });
};

export const getAllClubs = async (): Promise<Club[]> => {
  const snap = await getDocs(collection(db, 'clubs'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
};

export const getUserClubs = async (userId: string): Promise<Club[]> => {
  const allClubs = await getAllClubs();
  return allClubs.filter(c => 
    c.admins?.includes(userId) || 
    c.members?.includes(userId)
  );
};

export const getClubsForUser = async (userId: string): Promise<Club[]> => {
  return getUserClubs(userId);
};

// ============================================
// Club Join Requests
// ============================================

/**
 * Subscribe to pending join requests
 * 
 * NOTE: Uses simple query without orderBy to avoid needing composite index
 * Sorting is done in JavaScript instead
 */
export const subscribeToClubRequests = (
  clubId: string, 
  callback: (requests: ClubJoinRequest[]) => void
) => {
  // Simple query - just filter by status, sort in JS
  const q = query(
    collection(db, 'clubs', clubId, 'joinRequests'),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubJoinRequest));
    // Sort by createdAt descending in JavaScript
    requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(requests);
  }, (error) => {
    console.error('Error subscribing to club requests:', error);
    callback([]);
  });
};

export const subscribeToMyClubJoinRequest = (
  clubId: string,
  userId: string,
  callback: (hasPending: boolean) => void
) => {
  const q = query(
    collection(db, 'clubs', clubId, 'joinRequests'),
    where('userId', '==', userId),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, (snap) => {
    callback(snap.docs.length > 0);
  }, (error) => {
    console.error('Error checking join request:', error);
    callback(false);
  });
};

export const requestJoinClub = async (clubId: string, userId: string) => {
  const requestRef = doc(collection(db, 'clubs', clubId, 'joinRequests'));
  await setDoc(requestRef, {
    id: requestRef.id,
    clubId,
    userId,
    status: 'pending',
    createdAt: Date.now()
  });
};

/**
 * Approve a join request
 * - Updates request status to 'approved'
 * - Adds user to club's members array
 */
export const approveClubJoinRequest = async (
  clubId: string, 
  requestId: string, 
  userId: string
) => {
  const batch = writeBatch(db);
  
  // Update request status
  const reqRef = doc(db, 'clubs', clubId, 'joinRequests', requestId);
  batch.update(reqRef, { 
    status: 'approved', 
    updatedAt: Date.now() 
  });

  // Add user to members array
  const clubRef = doc(db, 'clubs', clubId);
  batch.update(clubRef, { 
    members: arrayUnion(userId), 
    updatedAt: Date.now() 
  });

  await batch.commit();
  
  console.log(`Approved join request ${requestId} for user ${userId}`);
};

/**
 * Decline a join request
 */
export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
  await updateDoc(
    doc(db, 'clubs', clubId, 'joinRequests', requestId), 
    { 
      status: 'declined', 
      updatedAt: Date.now() 
    }
  );
  
  console.log(`Declined join request ${requestId}`);
};

// ============================================
// Bulk Import (placeholder)
// ============================================

export const bulkImportClubMembers = async (_params: any): Promise<any[]> => {
  console.log('bulkImportClubMembers called - use Cloud Function for actual implementation');
  return [];
};