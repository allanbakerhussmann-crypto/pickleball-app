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
  arrayUnion,
  arrayRemove,
} from '@firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from '@firebase/storage';
import { db, storage } from './config';
import type { UserProfile, UserRole } from '../../types';

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
// Role Management
// ============================================

const addRole = async (userId: string, role: UserRole) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { roles: arrayUnion(role), updatedAt: Date.now() });
};

const removeRole = async (userId: string, role: UserRole) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { roles: arrayRemove(role), updatedAt: Date.now() });
};

export const promoteToAppAdmin = async (targetUserId: string) => {
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, {
    roles: arrayUnion('app_admin'),
    isAppAdmin: true,
    updatedAt: Date.now()
  });
};

export const demoteFromAppAdmin = async (targetUserId: string, currentUserId: string) => {
  if (targetUserId === currentUserId) {
    throw new Error("You cannot demote yourself from App Admin.");
  }
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, {
    roles: arrayRemove('app_admin'),
    isAppAdmin: false,
    updatedAt: Date.now()
  });
};

export const promoteToOrganizer = async (userId: string) => addRole(userId, 'organizer');
export const demoteFromOrganizer = async (userId: string) => removeRole(userId, 'organizer');
export const promoteToPlayer = async (userId: string) => addRole(userId, 'player');
export const demoteFromPlayer = async (userId: string) => removeRole(userId, 'player');