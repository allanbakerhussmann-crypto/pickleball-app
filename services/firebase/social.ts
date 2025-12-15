/**
 * Legacy Social Events
 * (Keeping for backwards compatibility)
 */

import { 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc,
  collection, 
  query, 
  orderBy,
  onSnapshot,
  arrayUnion,
  arrayRemove,
} from '@firebase/firestore';
import { db } from './config';
import type { SocialEvent } from '../../types';

// ============================================
// Social Event CRUD
// ============================================

export const createSocialEvent = async (event: Omit<SocialEvent, 'id'>) => {
  const ref = doc(collection(db, 'social_events'));
  await setDoc(ref, { ...event, id: ref.id });
};

export const subscribeToSocialEvents = (
  callback: (events: SocialEvent[]) => void
) => {
  const q = query(
    collection(db, 'social_events'), 
    orderBy('date', 'asc'), 
    orderBy('startTime', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const events = snap.docs.map(d => d.data() as SocialEvent);
    callback(events);
  });
};

export const joinSocialEvent = async (eventId: string, userId: string) => {
  const ref = doc(db, 'social_events', eventId);
  await updateDoc(ref, {
    attendees: arrayUnion(userId)
  });
};

export const leaveSocialEvent = async (eventId: string, userId: string) => {
  const ref = doc(db, 'social_events', eventId);
  await updateDoc(ref, {
    attendees: arrayRemove(userId)
  });
};

export const deleteSocialEvent = async (eventId: string) => {
  await deleteDoc(doc(db, 'social_events', eventId));
};