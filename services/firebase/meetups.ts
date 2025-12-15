/**
 * Social Meetups Management
 */

import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  collection, 
  query, 
  orderBy,
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
    createdAt: now,
    updatedAt: now
  };
  
  await setDoc(newDocRef, meetup);
  return newDocRef.id;
};

export const getMeetups = async (): Promise<Meetup[]> => {
  const q = query(collection(db, 'meetups'), orderBy('when', 'asc'));
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
    createdAt: Date.now()
  });
};

export const getMeetupRSVPs = async (meetupId: string): Promise<MeetupRSVP[]> => {
  const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
  const snap = await getDocs(rsvpsRef);
  const rsvps = snap.docs.map(d => d.data() as MeetupRSVP);
  
  // Enrich with user profiles
  if (rsvps.length > 0) {
    const userIds = rsvps.map(r => r.userId);
    const users = await getUsersByIds(userIds); 
    const userMap = new Map(users.map(u => [u.id, u]));
    
    return rsvps.map(r => ({
      ...r,
      userProfile: userMap.get(r.userId)
    }));
  }
  
  return rsvps;
};