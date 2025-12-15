/**
 * Club Management
 */

import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc,
  collection, 
  query, 
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  arrayUnion,
} from '@firebase/firestore';
import { db } from './config';
import type { Club, ClubJoinRequest } from '../../types';

// ============================================
// Club CRUD
// ============================================

export const createClub = async (clubData: Partial<Club>): Promise<string> => {
  const clubRef = doc(collection(db, 'clubs'));
  const now = Date.now();
  
  const club: Club = {
    id: clubRef.id,
    name: clubData.name || 'Unnamed Club',
    slug: clubData.slug || '',
    description: clubData.description || '',
    logoUrl: clubData.logoUrl || '',
    region: clubData.region || '',
    country: clubData.country || 'NZL',
    createdByUserId: clubData.createdByUserId || '',
    admins: clubData.admins || [],
    members: clubData.members || [],
    createdAt: now,
    updatedAt: now,
  } as Club;

  await setDoc(clubRef, club);
  return clubRef.id;
};

export const getClub = async (clubId: string): Promise<Club | null> => {
  const snap = await getDoc(doc(db, 'clubs', clubId));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Club : null;
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
  // Alias for getUserClubs for backwards compatibility
  return getUserClubs(userId);
};

// ============================================
// Club Join Requests
// ============================================

export const subscribeToClubRequests = (
  clubId: string, 
  callback: (requests: ClubJoinRequest[]) => void
) => {
  const q = query(
    collection(db, 'clubs', clubId, 'joinRequests'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubJoinRequest)));
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

export const approveClubJoinRequest = async (
  clubId: string, 
  requestId: string, 
  userId: string
) => {
  const batch = writeBatch(db);
  
  const reqRef = doc(db, 'clubs', clubId, 'joinRequests', requestId);
  batch.update(reqRef, { status: 'approved', updatedAt: Date.now() });

  const clubRef = doc(db, 'clubs', clubId);
  batch.update(clubRef, { 
    members: arrayUnion(userId), 
    updatedAt: Date.now() 
  });

  await batch.commit();
};

export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
  await updateDoc(
    doc(db, 'clubs', clubId, 'joinRequests', requestId), 
    { status: 'declined', updatedAt: Date.now() }
  );
};

// ============================================
// Bulk Import (placeholder)
// ============================================

export const bulkImportClubMembers = async (_params: any): Promise<any[]> => {
  console.log('bulkImportClubMembers called - use Cloud Function for actual implementation');
  return [];
};