/**
 * Meetup Invites Service
 *
 * Manages private meetup invitations. Inviting a user grants immediate access
 * (no accept/decline step). Uses writeBatch to atomically create the invite doc,
 * update invitedUserIds on the meetup, and send an in-app notification.
 *
 * @version 07.62
 * @file services/firebase/meetupInvites.ts
 */

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from '@firebase/firestore';
import { db } from './config';
import { createNotification } from './notifications';
import type { MeetupInvite, Meetup } from '../../types';

// =============================================================================
// SEND INVITE
// =============================================================================

/**
 * Invite a user to a private meetup.
 * Atomically: creates invite doc + adds userId to meetup.invitedUserIds + sends notification.
 */
export const sendMeetupInvite = async (
  meetup: Meetup,
  inviterId: string,
  inviterName: string,
  invitedUser: { id: string; displayName: string; email?: string }
): Promise<string> => {
  const invitesRef = collection(db, 'meetupInvites');
  const inviteDocRef = doc(invitesRef);
  const meetupRef = doc(db, 'meetups', meetup.id);

  const invite: MeetupInvite = {
    id: inviteDocRef.id,
    meetupId: meetup.id,
    meetupTitle: meetup.title,
    inviterId,
    inviterName,
    invitedUserId: invitedUser.id,
    invitedUserName: invitedUser.displayName,
    invitedUserEmail: invitedUser.email,
    createdAt: Date.now(),
    meetupDate: meetup.when,
    meetupLocation: meetup.locationName,
  };

  // Batch: create invite + update meetup invitedUserIds
  const batch = writeBatch(db);
  batch.set(inviteDocRef, invite);
  batch.update(meetupRef, {
    invitedUserIds: arrayUnion(invitedUser.id),
  });
  await batch.commit();

  // Send in-app notification (non-blocking, don't fail the invite if notification fails)
  try {
    await createNotification(invitedUser.id, {
      type: 'meetup_invite',
      title: 'Meetup Invitation',
      message: `${inviterName} invited you to ${meetup.title}`,
      data: {
        meetupId: meetup.id,
        inviteId: inviteDocRef.id,
      },
    });
  } catch (err) {
    console.error('Failed to send invite notification:', err);
  }

  return inviteDocRef.id;
};

// =============================================================================
// REMOVE INVITE
// =============================================================================

/**
 * Remove a user's invitation to a private meetup.
 * Atomically: deletes invite doc + removes userId from meetup.invitedUserIds.
 */
export const removeMeetupInvite = async (
  inviteId: string,
  meetupId: string,
  invitedUserId: string
): Promise<void> => {
  const inviteRef = doc(db, 'meetupInvites', inviteId);
  const meetupRef = doc(db, 'meetups', meetupId);

  const batch = writeBatch(db);
  batch.delete(inviteRef);
  batch.update(meetupRef, {
    invitedUserIds: arrayRemove(invitedUserId),
  });
  await batch.commit();
};

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all invites for a specific meetup (organizer view).
 */
export const getMeetupInvites = async (meetupId: string): Promise<MeetupInvite[]> => {
  const q = query(
    collection(db, 'meetupInvites'),
    where('meetupId', '==', meetupId),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as MeetupInvite);
};

/**
 * Get all meetup invites for a specific user (player view).
 */
export const getMyMeetupInvites = async (userId: string): Promise<MeetupInvite[]> => {
  const q = query(
    collection(db, 'meetupInvites'),
    where('invitedUserId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as MeetupInvite);
};

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

/**
 * Subscribe to real-time updates for a user's meetup invitations.
 */
export const subscribeToMyMeetupInvites = (
  userId: string,
  callback: (invites: MeetupInvite[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'meetupInvites'),
    where('invitedUserId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => d.data() as MeetupInvite));
  });
};

/**
 * Subscribe to real-time updates for a meetup's invitations (organizer view).
 */
export const subscribeToMeetupInvites = (
  meetupId: string,
  callback: (invites: MeetupInvite[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'meetupInvites'),
    where('meetupId', '==', meetupId),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => d.data() as MeetupInvite));
  });
};
