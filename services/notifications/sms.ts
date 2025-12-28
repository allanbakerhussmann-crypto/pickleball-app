/**
 * SMS Notification Service
 *
 * Frontend service for sending SMS notifications via Twilio.
 * Works by writing to Firestore, which triggers a Cloud Function to send via Twilio.
 *
 * FILE LOCATION: services/notifications/sms.ts
 * VERSION: 06.17
 */

import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import type { SMSMessage, SMSNotificationType } from '../../types';

// ============================================
// Core SMS Functions
// ============================================

/**
 * Send a single SMS message
 * Creates a document in sms_messages collection, which triggers the Cloud Function
 *
 * @param to - Phone number in E.164 format (+1XXXXXXXXXX)
 * @param body - Message content
 * @param options - Optional metadata (userId, eventType, eventId, notificationType)
 * @returns The document ID of the queued SMS
 */
export async function sendSMS(
  to: string,
  body: string,
  options?: {
    userId?: string;
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
    notificationType?: SMSNotificationType;
  }
): Promise<string> {
  // Validate phone format
  if (!to.startsWith('+')) {
    throw new Error('Phone number must be in E.164 format (+1XXXXXXXXXX)');
  }

  const smsData: Omit<SMSMessage, 'id'> = {
    to,
    body,
    createdAt: Date.now(),
    status: 'pending',
    ...options,
  };

  const docRef = await addDoc(collection(db, 'sms_messages'), {
    ...smsData,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Send SMS to multiple recipients
 * Uses the bulk SMS Cloud Function for efficiency
 *
 * @param recipients - Array of { phone, name? }
 * @param message - Message to send to all recipients
 * @param options - Optional metadata (eventType, eventId)
 * @returns Result with sent/invalid counts
 */
export async function sendBulkSMS(
  recipients: Array<{ phone: string; name?: string }>,
  message: string,
  options?: {
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
  }
): Promise<{ success: boolean; sent: number; invalid: number; message: string }> {
  const sendBulkSMSFn = httpsCallable<
    { recipients: typeof recipients; message: string; eventType?: string; eventId?: string },
    { success: boolean; sent: number; invalid: number; message: string }
  >(functions, 'sendBulkSMS');

  const result = await sendBulkSMSFn({
    recipients,
    message,
    ...options,
  });

  return result.data;
}

// ============================================
// Notification Helpers
// ============================================

/**
 * Notify players of their court assignment via SMS
 */
export async function notifySMSCourtAssignment(
  phone: string,
  courtName: string,
  matchInfo: string,
  options?: {
    userId?: string;
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
    matchId?: string;
  }
): Promise<string> {
  const message = `🏓 Match Ready!\nCourt: ${courtName}\n${matchInfo}\nPlease report to court now.`;

  return sendSMS(phone, message, {
    ...options,
    notificationType: 'court_assignment',
  });
}

/**
 * Notify players of match result
 */
export async function notifySMSMatchResult(
  phone: string,
  result: string,
  options?: {
    userId?: string;
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
    matchId?: string;
  }
): Promise<string> {
  const message = `🏓 Match Complete!\n${result}`;

  return sendSMS(phone, message, {
    ...options,
    notificationType: 'match_result',
  });
}

/**
 * Send tournament/event reminder
 */
export async function notifySMSReminder(
  phone: string,
  eventName: string,
  reminderText: string,
  options?: {
    userId?: string;
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
  }
): Promise<string> {
  const message = `🏓 Reminder: ${eventName}\n${reminderText}`;

  return sendSMS(phone, message, {
    ...options,
    notificationType: 'reminder',
  });
}

/**
 * Send score confirmation request
 */
export async function notifySMSScoreConfirmation(
  phone: string,
  submitterName: string,
  scoreDisplay: string,
  eventName?: string,
  options?: {
    userId?: string;
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
    matchId?: string;
  }
): Promise<string> {
  const eventText = eventName ? ` (${eventName})` : '';
  const message = `🏓 Score Submitted${eventText}\n${submitterName} reported: ${scoreDisplay}\nPlease confirm or dispute in the app.`;

  return sendSMS(phone, message, {
    ...options,
    notificationType: 'score_confirmation',
  });
}

/**
 * Send custom message (for organizer bulk messaging)
 */
export async function notifySMSCustom(
  phone: string,
  message: string,
  options?: {
    userId?: string;
    eventType?: 'tournament' | 'league' | 'meetup';
    eventId?: string;
  }
): Promise<string> {
  return sendSMS(phone, message, {
    ...options,
    notificationType: 'custom',
  });
}

// ============================================
// SMS History & Status
// ============================================

/**
 * Get SMS history for an event
 */
export async function getSMSHistory(
  eventType: 'tournament' | 'league' | 'meetup',
  eventId: string,
  maxResults: number = 50
): Promise<SMSMessage[]> {
  const smsRef = collection(db, 'sms_messages');
  const q = query(
    smsRef,
    where('eventType', '==', eventType),
    where('eventId', '==', eventId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as SMSMessage));
}

/**
 * Format phone number to E.164 format
 * Assumes US number if no country code provided
 */
export function formatPhoneE164(phone: string): string | null {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Already in E.164 format
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // US number (10 digits)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // US number with country code (11 digits starting with 1)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }

  // Invalid format
  return null;
}

/**
 * Validate if a phone number is valid for SMS
 */
export function isValidPhoneNumber(phone: string): boolean {
  const formatted = formatPhoneE164(phone);
  return formatted !== null && formatted.length >= 10;
}
