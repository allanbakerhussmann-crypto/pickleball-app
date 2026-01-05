/**
 * Communications Cloud Function
 *
 * Processes messages in the comms_queue subcollection for both
 * tournaments and leagues.
 * Uses Firebase Functions v2 with Firestore triggers.
 *
 * FILE LOCATION: functions/src/comms.ts
 * VERSION: 07.17
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import twilio from 'twilio';

// ============================================
// SECRETS (Functions v2)
// ============================================

const twilioSid = defineSecret('TWILIO_SID');
const twilioToken = defineSecret('TWILIO_TOKEN');
const twilioPhone = defineSecret('TWILIO_PHONE');

// ============================================
// TYPES
// ============================================

type CommsMessageType = 'sms' | 'email';
type CommsMessageStatus = 'pending' | 'sent' | 'failed';

interface CommsQueueMessage {
  type: CommsMessageType;
  status: CommsMessageStatus;
  recipientId: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  body: string;
  subject?: string | null;
  templateId?: string | null;
  templateData?: Record<string, string> | null;
  // Scope - ONE of tournamentId or leagueId
  tournamentId?: string;
  leagueId?: string;
  divisionId?: string | null;
  poolGroup?: string | null;
  matchId?: string | null;
  createdAt: number;
  createdBy: string;
  sentAt?: number | null;
  failedAt?: number | null;
  error?: string | null;
  lockedAt?: number | null;
  lockedBy?: string | null;
  retried: boolean;
  retryOf?: string | null;
}

// ============================================
// HELPER: Send SMS via Twilio
// ============================================

async function sendSMSViaTwilio(
  to: string,
  body: string,
  sid: string,
  token: string,
  fromPhone: string
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  try {
    const client = twilio(sid, token);

    const result = await client.messages.create({
      body,
      to,
      from: fromPhone,
    });

    console.log(`SMS sent successfully. Twilio SID: ${result.sid}`);
    return { success: true, twilioSid: result.sid };
  } catch (error: any) {
    console.error('Twilio error:', error.message);
    return { success: false, error: error.message || 'Unknown Twilio error' };
  }
}

// ============================================
// HELPER: Send Email (STUB)
// ============================================

async function sendEmail(
  _to: string,
  _subject: string,
  _body: string
): Promise<{ success: boolean; error?: string }> {
  // TODO: Implement email sending via SendGrid or other provider
  console.log('Email sending not implemented yet');
  return {
    success: false,
    error: 'Email sending not implemented. Configure SendGrid integration.',
  };
}

// ============================================
// SHARED PROCESSING LOGIC
// ============================================

/**
 * Process a comms queue message (shared logic for tournaments and leagues)
 */
async function processCommsMessage(
  snap: admin.firestore.DocumentSnapshot,
  messageId: string,
  entityType: 'tournament' | 'league',
  entityId: string,
  twilioSidValue: string,
  twilioTokenValue: string,
  twilioPhoneValue: string
): Promise<void> {
  const message = snap.data() as CommsQueueMessage;
  const docRef = snap.ref;

  console.log(`Processing comms message ${messageId} for ${entityType} ${entityId}`);
  console.log(`Type: ${message.type}, Recipient: ${message.recipientName}`);

  // ========================================
  // STEP 1: Claim the document with a lock
  // ========================================

  const db = admin.firestore();
  const functionInstanceId = `comms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Use transaction to prevent race conditions
    const claimed = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        console.log(`Message ${messageId} no longer exists`);
        return false;
      }

      const data = doc.data() as CommsQueueMessage;

      // Check if already processed or locked
      if (data.status !== 'pending') {
        console.log(`Message ${messageId} already processed (status: ${data.status})`);
        return false;
      }

      if (data.lockedAt && data.lockedBy) {
        // Check if lock is stale (older than 5 minutes)
        const lockAge = Date.now() - data.lockedAt;
        if (lockAge < 5 * 60 * 1000) {
          console.log(`Message ${messageId} is locked by ${data.lockedBy}`);
          return false;
        }
        console.log(`Message ${messageId} has stale lock, claiming...`);
      }

      // Claim the document
      transaction.update(docRef, {
        lockedAt: Date.now(),
        lockedBy: functionInstanceId,
      });

      return true;
    });

    if (!claimed) {
      console.log(`Could not claim message ${messageId}, skipping`);
      return;
    }

    console.log(`Claimed message ${messageId} with lock ${functionInstanceId}`);
  } catch (error: any) {
    console.error(`Error claiming message ${messageId}:`, error.message);
    return;
  }

  // ========================================
  // STEP 2: Send the message
  // ========================================

  let result: { success: boolean; twilioSid?: string; error?: string };

  if (message.type === 'sms') {
    // Validate phone number
    if (!message.recipientPhone) {
      result = { success: false, error: 'No phone number provided' };
    } else if (!message.recipientPhone.startsWith('+')) {
      result = { success: false, error: 'Invalid phone format. Must be E.164 (+XXXXXXXXXXX)' };
    } else if (!message.body || message.body.trim().length === 0) {
      result = { success: false, error: 'Message body is empty' };
    } else {
      // Send SMS
      result = await sendSMSViaTwilio(
        message.recipientPhone,
        message.body,
        twilioSidValue,
        twilioTokenValue,
        twilioPhoneValue
      );
    }
  } else if (message.type === 'email') {
    // Validate email
    if (!message.recipientEmail) {
      result = { success: false, error: 'No email address provided' };
    } else if (!message.subject) {
      result = { success: false, error: 'Email subject is required' };
    } else {
      // Send email (stubbed)
      result = await sendEmail(
        message.recipientEmail,
        message.subject,
        message.body
      );
    }
  } else {
    result = { success: false, error: `Unknown message type: ${message.type}` };
  }

  // ========================================
  // STEP 3: Update status
  // ========================================

  try {
    if (result.success) {
      await docRef.update({
        status: 'sent' as CommsMessageStatus,
        sentAt: Date.now(),
        error: null,
        // Clear lock
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`Message ${messageId} sent successfully`);
    } else {
      await docRef.update({
        status: 'failed' as CommsMessageStatus,
        failedAt: Date.now(),
        error: result.error || 'Unknown error',
        // Clear lock
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`Message ${messageId} failed: ${result.error}`);

      // Optionally create a retry message if not already retried
      if (!message.retried) {
        console.log(`Creating retry message for ${messageId}`);
        // Determine collection path based on entity type
        const collectionPath = entityType === 'tournament'
          ? db.collection('tournaments').doc(entityId).collection('comms_queue')
          : db.collection('leagues').doc(entityId).collection('comms_queue');

        const retryRef = collectionPath.doc();

        await retryRef.set({
          ...message,
          status: 'pending',
          createdAt: Date.now(),
          sentAt: null,
          failedAt: null,
          error: null,
          lockedAt: null,
          lockedBy: null,
          retried: true,
          retryOf: messageId,
        });
        console.log(`Retry message created: ${retryRef.id}`);
      }
    }
  } catch (error: any) {
    console.error(`Error updating message ${messageId} status:`, error.message);
  }
}

// ============================================
// TOURNAMENT TRIGGER: Process Tournament Comms Queue
// ============================================

/**
 * Firestore onCreate trigger for tournament comms_queue messages.
 */
export const comms_processQueue = onDocumentCreated(
  {
    document: 'tournaments/{tournamentId}/comms_queue/{messageId}',
    secrets: [twilioSid, twilioToken, twilioPhone],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.error('No data in event');
      return;
    }

    await processCommsMessage(
      snap,
      event.params.messageId,
      'tournament',
      event.params.tournamentId,
      twilioSid.value(),
      twilioToken.value(),
      twilioPhone.value()
    );
  }
);

// ============================================
// LEAGUE TRIGGER: Process League Comms Queue
// ============================================

/**
 * Firestore onCreate trigger for league comms_queue messages.
 */
export const comms_processLeagueQueue = onDocumentCreated(
  {
    document: 'leagues/{leagueId}/comms_queue/{messageId}',
    secrets: [twilioSid, twilioToken, twilioPhone],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.error('No data in event');
      return;
    }

    await processCommsMessage(
      snap,
      event.params.messageId,
      'league',
      event.params.leagueId,
      twilioSid.value(),
      twilioToken.value(),
      twilioPhone.value()
    );
  }
);
