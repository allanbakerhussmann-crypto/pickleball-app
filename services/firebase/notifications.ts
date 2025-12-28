/**
 * Notification Service
 *
 * Handles in-app notifications for users (court assignments, match results, etc.)
 *
 * FILE LOCATION: services/firebase/notifications.ts
 * VERSION: V06.07
 */

import {
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type { Notification } from '../../types';

// ============================================
// Create Notification
// ============================================

/**
 * Create a notification for a user
 */
export const createNotification = async (
  userId: string,
  notification: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>
): Promise<string> => {
  const notificationsRef = collection(db, 'users', userId, 'notifications');
  const notificationRef = doc(notificationsRef);

  const fullNotification: Notification = {
    id: notificationRef.id,
    userId,
    read: false,
    createdAt: Date.now(),
    ...notification,
  };

  await setDoc(notificationRef, fullNotification);
  return notificationRef.id;
};

/**
 * Create notifications for multiple users (batch)
 * Useful for notifying all players in a match
 */
export const createNotificationBatch = async (
  userIds: string[],
  notification: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>
): Promise<void> => {
  if (userIds.length === 0) return;

  const batch = writeBatch(db);
  const now = Date.now();

  for (const userId of userIds) {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const notificationRef = doc(notificationsRef);

    const fullNotification: Notification = {
      id: notificationRef.id,
      userId,
      read: false,
      createdAt: now,
      ...notification,
    };

    batch.set(notificationRef, fullNotification);
  }

  await batch.commit();
};

// ============================================
// Subscribe to Notifications
// ============================================

/**
 * Subscribe to a user's notifications (real-time)
 * Returns the unsubscribe function
 */
export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void
): (() => void) => {
  const notificationsRef = collection(db, 'users', userId, 'notifications');
  const q = query(
    notificationsRef,
    orderBy('createdAt', 'desc'),
    limit(50) // Limit to most recent 50
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Notification));
    callback(notifications);
  });
};

// ============================================
// Mark as Read
// ============================================

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async (
  userId: string,
  notificationId: string
): Promise<void> => {
  const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
  await updateDoc(notificationRef, { read: true });
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsAsRead = async (
  userId: string,
  notifications: Notification[]
): Promise<void> => {
  const unread = notifications.filter(n => !n.read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);

  for (const notification of unread) {
    const notificationRef = doc(db, 'users', userId, 'notifications', notification.id);
    batch.update(notificationRef, { read: true });
  }

  await batch.commit();
};

// ============================================
// Notification Helpers
// ============================================

/**
 * Create a court assignment notification
 */
export const notifyCourtAssignment = async (
  playerIds: string[],
  tournamentId: string,
  matchId: string,
  courtName: string,
  opponentName?: string
): Promise<void> => {
  const message = opponentName
    ? `Your match vs ${opponentName} is on ${courtName}. Head to court and start when ready.`
    : `Your match is assigned to ${courtName}. Head to court and start when ready.`;

  await createNotificationBatch(playerIds, {
    type: 'court_assignment',
    title: "You're on court!",
    message,
    data: {
      tournamentId,
      matchId,
      courtName,
    },
  });
};

/**
 * Create a match result notification
 */
export const notifyMatchResult = async (
  playerIds: string[],
  tournamentId: string,
  matchId: string,
  result: string
): Promise<void> => {
  await createNotificationBatch(playerIds, {
    type: 'match_result',
    title: 'Match Complete',
    message: result,
    data: {
      tournamentId,
      matchId,
    },
  });
};

/**
 * Create a score confirmation notification for league matches
 * Notifies the opponent that a score has been submitted and needs confirmation
 */
export const notifyScoreConfirmation = async (
  opponentUserIds: string[],
  leagueId: string,
  matchId: string,
  submitterName: string,
  scoreDisplay: string,
  leagueName?: string
): Promise<void> => {
  const title = 'Confirm Match Score';
  const message = leagueName
    ? `${submitterName} submitted a score (${scoreDisplay}) for your ${leagueName} match. Please confirm or dispute.`
    : `${submitterName} submitted a score (${scoreDisplay}) for your match. Please confirm or dispute.`;

  await createNotificationBatch(opponentUserIds, {
    type: 'score_confirmation',
    title,
    message,
    data: {
      leagueId,
      matchId,
    },
  });
};
