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
 * Get all meetups (optionally include cancelled)
 */
export const getMeetups = async (includeCancelled = false): Promise<Meetup[]> => {
  const q = query(collection(db, 'meetups'), orderBy('when', 'asc'));
  const snap = await getDocs(q);
  const meetups = snap.docs.map(d => d.data() as Meetup);
  
  if (includeCancelled) {
    return meetups;
  }
  
  return meetups.filter(m => m.status !== 'cancelled');
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
        const userIds = rsvps.map(r => r.userId);
        console.log('Fetching user profiles for:', userIds);
        
        const users = await getUsersByIds(userIds);
        console.log('Users fetched:', users.length);
        
        const userMap = new Map(users.map(u => [u.id, u]));
        
        return rsvps.map(r => ({
          ...r,
          userProfile: userMap.get(r.userId)
        }));
      } catch (userError) {
        console.error('Error fetching user profiles:', userError);
        // Return RSVPs without user profiles
        return rsvps;
      }
    }
    
    return rsvps;
  } catch (error) {
    console.error('Error in getMeetupRSVPs:', error);
    return [];
  }
};