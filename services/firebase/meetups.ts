/**
 * Social Meetups Management
 */

import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc,
  deleteDoc,
  collection, 
  query, 
  orderBy,
  where,
} from '@firebase/firestore';
import { db } from './config';
import { getUsersByIds } from './users';
import type { Meetup, MeetupRSVP } from '../../types';

// ============================================
// Meetup CRUD
// ============================================

export const createMeetup = async (
  meetupData: Omit<Meetup, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  const meetupsRef = collection(db, 'meetups');
  const newDocRef = doc(meetupsRef);
  const now = Date.now();
  
  const meetup: Meetup = {
    ...meetupData,
    id: newDocRef.id,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
  
  await setDoc(newDocRef, meetup);
  return newDocRef.id;
};

/**
 * Update an existing meetup
 */
export const updateMeetup = async (
  meetupId: string,
  updates: Partial<Omit<Meetup, 'id' | 'createdAt' | 'createdByUserId'>>
): Promise<void> => {
  const meetupRef = doc(db, 'meetups', meetupId);
  await updateDoc(meetupRef, {
    ...updates,
    updatedAt: Date.now()
  });
};

/**
 * Cancel a meetup (soft delete)
 */
export const cancelMeetup = async (
  meetupId: string,
  reason?: string
): Promise<void> => {
  const meetupRef = doc(db, 'meetups', meetupId);
  await updateDoc(meetupRef, {
    status: 'cancelled',
    cancelledAt: Date.now(),
    cancelReason: reason || null,
    updatedAt: Date.now()
  });
};

/**
 * Permanently delete a meetup and all RSVPs
 */
export const deleteMeetup = async (meetupId: string): Promise<void> => {
  // First delete all RSVPs
  try {
    const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
    const rsvpSnap = await getDocs(rsvpsRef);
    
    const deletePromises = rsvpSnap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (e) {
    console.error('Error deleting RSVPs:', e);
  }
  
  // Then delete the meetup
  await deleteDoc(doc(db, 'meetups', meetupId));
};

/**
 * Get all meetups the user can see.
 * Splits into parallel queries to handle private meetup Firestore rules:
 * - Query 1: Non-private meetups (public/linkOnly)
 * - Query 2: Private meetups where user is invited
 * - Query 3: Private meetups the user created
 */
export const getMeetups = async (userId?: string, includeCancelled = false): Promise<Meetup[]> => {
  const meetupsRef = collection(db, 'meetups');

  // Helper: run a query, return empty array on failure (e.g. missing index)
  const safeQuery = (q: ReturnType<typeof query>): Promise<Meetup[]> =>
    getDocs(q)
      .then(snap => snap.docs.map(d => d.data() as Meetup))
      .catch(err => {
        console.warn('getMeetups query failed (index may be missing):', err.message);
        return [];
      });

  // Query 1: Non-private meetups (public, linkOnly)
  const q1 = query(meetupsRef, where('visibility', 'in', ['public', 'linkOnly']), orderBy('when', 'asc'));

  // Fallback: meetups without visibility field (legacy data, treated as public)
  // Firestore can't query for "field does not exist", so we query all and filter client-side
  // Only needed until legacy meetups are migrated
  const qLegacy = query(meetupsRef, orderBy('when', 'asc'));

  // Run queries in parallel
  const promises: Promise<Meetup[]>[] = [
    safeQuery(q1),
    // Legacy fallback: get all meetups, keep only those without visibility set
    safeQuery(qLegacy).then(meetups => meetups.filter(m => !m.visibility)),
  ];

  if (userId) {
    // Query 2: Private meetups where user is invited
    const q2 = query(
      meetupsRef,
      where('visibility', '==', 'private'),
      where('invitedUserIds', 'array-contains', userId),
      orderBy('when', 'asc')
    );
    promises.push(safeQuery(q2));

    // Query 3: Private meetups user created (they won't be in invitedUserIds)
    const q3 = query(
      meetupsRef,
      where('visibility', '==', 'private'),
      where('createdByUserId', '==', userId),
      orderBy('when', 'asc')
    );
    promises.push(safeQuery(q3));
  }

  const results = await Promise.all(promises);

  // Merge and deduplicate by id
  const allMap = new Map<string, Meetup>();
  for (const batch of results) {
    for (const m of batch) {
      allMap.set(m.id, m);
    }
  }

  let meetups = Array.from(allMap.values()).sort((a, b) => a.when - b.when);

  if (!includeCancelled) {
    meetups = meetups.filter(m => m.status !== 'cancelled');
  }

  return meetups;
};

/**
 * Get meetups created by a specific user
 */
export const getMyMeetups = async (userId: string): Promise<Meetup[]> => {
  const q = query(
    collection(db, 'meetups'), 
    where('createdByUserId', '==', userId),
    orderBy('when', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Meetup);
};

export const getMeetupById = async (meetupId: string): Promise<Meetup | null> => {
  const snap = await getDoc(doc(db, 'meetups', meetupId));
  return snap.exists() ? (snap.data() as Meetup) : null;
};

// ============================================
// RSVP Management
// ============================================

export const setMeetupRSVP = async (
  meetupId: string, 
  userId: string, 
  status: "going" | "maybe"
): Promise<void> => {
  const rsvpRef = doc(db, 'meetups', meetupId, 'rsvps', userId);
  await setDoc(rsvpRef, {
    userId,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
};

/**
 * Remove RSVP entirely (withdraw)
 */
export const removeMeetupRSVP = async (
  meetupId: string,
  userId: string
): Promise<void> => {
  const rsvpRef = doc(db, 'meetups', meetupId, 'rsvps', userId);
  await deleteDoc(rsvpRef);
};

export const getMeetupRSVPs = async (meetupId: string): Promise<MeetupRSVP[]> => {
  try {
    console.log('getMeetupRSVPs called for meetupId:', meetupId);
    
    const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
    const snap = await getDocs(rsvpsRef);
    
    console.log('RSVP docs found:', snap.docs.length);
    
    if (snap.empty) {
      console.log('No RSVPs found, returning empty array');
      return [];
    }
    
    const rsvps = snap.docs.map(d => {
      const data = d.data();
      console.log('RSVP data:', data);
      return data as MeetupRSVP;
    });
    
    // Try to enrich with user profiles, but don't fail if it doesn't work
    if (rsvps.length > 0) {
      try {
        // Handle both legacy (userId) and new (odUserId) field names
        const userIds = rsvps.map(r => r.odUserId || (r as any).userId);
        console.log('Fetching user profiles for:', userIds);

        const users = await getUsersByIds(userIds);
        console.log('Users fetched:', users.length);

        const userMap = new Map(users.map(u => [u.id, u]));

        return rsvps.map(r => {
          const uid = r.odUserId || (r as any).userId;
          const profile = userMap.get(uid);
          return {
            ...r,
            // Map to expected fields for MeetupScoring
            odUserId: uid,
            odUserName: r.odUserName || profile?.displayName || 'Player',
            duprId: r.duprId || profile?.duprId,
            userProfile: profile
          };
        });
      } catch (userError) {
        console.error('Error fetching user profiles:', userError);
        // Return RSVPs with at least odUserId mapped
        return rsvps.map(r => ({
          ...r,
          odUserId: r.odUserId || (r as any).userId,
          odUserName: r.odUserName || 'Player'
        }));
      }
    }
    
    return rsvps;
  } catch (error) {
    console.error('Error in getMeetupRSVPs:', error);
    return [];
  }
};