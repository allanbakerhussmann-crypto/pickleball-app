/**
 * Communications Cloud Function
 *
 * Processes messages in the comms_queue subcollection for both
 * tournaments and leagues.
 * Uses Firebase Functions v1 with Firestore triggers.
 * SMS provider: SMSGlobal (better NZ coverage than Twilio)
 *
 * FILE LOCATION: functions/src/comms.ts
 * VERSION: 07.19
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// ============================================
// SMSGLOBAL CONFIG (Functions v1)
// ============================================

const getSMSGlobalConfig = () => {
  const config = functions.config();
  if (!config.smsglobal?.apikey || !config.smsglobal?.apisecret) {
    throw new Error('SMSGlobal credentials not configured. Run: firebase functions:config:set smsglobal.apikey="..." smsglobal.apisecret="..."');
  }
  return {
    apiKey: config.smsglobal.apikey,
    apiSecret: config.smsglobal.apisecret,
    origin: config.smsglobal.origin || 'Pickleball',
  };
};

// ============================================
// SMSGLOBAL MAC AUTHENTICATION
// ============================================

/**
 * Generate MAC authentication header for SMSGlobal API
 * Based on OAuth 2.0 MAC token spec
 */
function generateMACAuth(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  host: string,
  port: string = '443'
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // MAC base string: timestamp\nnonce\nmethod\npath\nhost\nport\n\n
  const baseString = `${timestamp}\n${nonce}\n${method}\n${path}\n${host}\n${port}\n\n`;

  // HMAC-SHA256
  const mac = crypto.createHmac('sha256', apiSecret)
    .update(baseString)
    .digest('base64');

  return `MAC id="${apiKey}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
}

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

interface SMSConfig {
  apiKey: string;
  apiSecret: string;
  origin: string;
}

// ============================================
// HELPER: Send SMS via SMSGlobal
// ============================================

async function sendSMSViaSMSGlobal(
  to: string,
  body: string,
  apiKey: string,
  apiSecret: string,
  origin: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const host = 'api.smsglobal.com';
    const path = '/v2/sms';

    const authHeader = generateMACAuth(apiKey, apiSecret, 'POST', path, host);

    console.log(`Sending SMS to ${to} via SMSGlobal (origin: ${origin})`);

    const response = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        destination: to,
        message: body,
        origin: origin,
      }),
    });

    if (response.status === 200 || response.status === 202) {
      const data = await response.json() as { messages?: { id?: string }[] };
      const messageId = data.messages?.[0]?.id;
      console.log(`SMS sent via SMSGlobal. Message ID: ${messageId}`);
      return { success: true, messageId };
    }

    // Handle errors
    const errorText = await response.text();
    console.error(`SMSGlobal error (${response.status}):`, errorText);

    if (response.status === 401) {
      return { success: false, error: 'SMSGlobal authentication failed - check API key/secret' };
    }

    if (response.status === 402) {
      return { success: false, error: 'SMSGlobal account out of credits' };
    }

    if (response.status === 400) {
      return { success: false, error: `Invalid request: ${errorText}` };
    }

    return { success: false, error: `SMSGlobal error: ${response.status} - ${errorText}` };
  } catch (error: any) {
    console.error('SMSGlobal error:', error.message);
    return { success: false, error: error.message || 'Unknown SMSGlobal error' };
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
  smsConfig: SMSConfig
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

  let result: { success: boolean; messageId?: string; error?: string };

  if (message.type === 'sms') {
    // Validate phone number
    if (!message.recipientPhone) {
      result = { success: false, error: 'No phone number provided' };
    } else if (!message.recipientPhone.startsWith('+')) {
      result = { success: false, error: 'Invalid phone format. Must be E.164 (+XXXXXXXXXXX)' };
    } else if (!message.body || message.body.trim().length === 0) {
      result = { success: false, error: 'Message body is empty' };
    } else {
      // Send SMS via SMSGlobal
      result = await sendSMSViaSMSGlobal(
        message.recipientPhone,
        message.body,
        smsConfig.apiKey,
        smsConfig.apiSecret,
        smsConfig.origin
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
export const comms_processQueue = functions.firestore
  .document('tournaments/{tournamentId}/comms_queue/{messageId}')
  .onCreate(async (snap, context) => {
    const smsConfig = getSMSGlobalConfig();
    await processCommsMessage(
      snap,
      context.params.messageId,
      'tournament',
      context.params.tournamentId,
      smsConfig
    );
  });

// ============================================
// LEAGUE TRIGGER: Process League Comms Queue
// ============================================

/**
 * Firestore onCreate trigger for league comms_queue messages.
 */
export const comms_processLeagueQueue = functions.firestore
  .document('leagues/{leagueId}/comms_queue/{messageId}')
  .onCreate(async (snap, context) => {
    const smsConfig = getSMSGlobalConfig();
    await processCommsMessage(
      snap,
      context.params.messageId,
      'league',
      context.params.leagueId,
      smsConfig
    );
  });
