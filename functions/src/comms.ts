/**
 * Communications Cloud Function
 *
 * Processes messages in the comms_queue subcollection for both
 * tournaments and leagues.
 * Uses Firebase Functions v1 with Firestore triggers.
 * SMS provider: SMSGlobal (better NZ coverage than Twilio)
 *
 * SMS CREDITS SYSTEM (V07.50 - FIXED):
 * - RESERVE credits BEFORE sending (transactional, prevents race conditions)
 * - Segment-based costing: 1 credit per 160 chars (max 2 segments)
 * - Throws on insufficient credits (no silent failures)
 * - Logs smsSegments and smsCreditsUsed on message doc
 *
 * FILE LOCATION: functions/src/comms.ts
 * VERSION: 07.50
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// ============================================
// SMS CREDITS CONSTANTS
// ============================================

const FREE_STARTER_SMS_CREDITS = 25;
const SMS_CHAR_LIMIT = 160;
const MAX_SMS_SEGMENTS = 2;

// ============================================
// CUSTOM ERROR CLASSES
// ============================================

class InsufficientCreditsError extends Error {
  constructor(available: number, required: number) {
    super(`INSUFFICIENT_SMS_CREDITS: ${available} available, ${required} required`);
    this.name = 'InsufficientCreditsError';
  }
}

class MessageTooLongError extends Error {
  constructor(segments: number) {
    super(`MESSAGE_TOO_LONG: ${segments} segments (max ${MAX_SMS_SEGMENTS})`);
    this.name = 'MessageTooLongError';
  }
}

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
// AMAZON SES CONFIG (Functions v1)
// ============================================

const getSESConfig = () => {
  const config = functions.config();
  if (!config.ses?.region || !config.ses?.access_key_id || !config.ses?.secret_access_key) {
    throw new Error('SES credentials not configured. Run: firebase functions:config:set ses.region="ap-southeast-2" ses.access_key_id="..." ses.secret_access_key="..." ses.from_email="..."');
  }
  return {
    region: config.ses.region,
    accessKeyId: config.ses.access_key_id,
    secretAccessKey: config.ses.secret_access_key,
    fromEmail: config.ses.from_email || 'noreply@pickleballdirector.co.nz',
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
  // V07.50: SMS cost tracking
  smsSegments?: number | null;
  smsCreditsUsed?: number | null;
  providerMessageId?: string | null;
}

interface SMSConfig {
  apiKey: string;
  apiSecret: string;
  origin: string;
}

// SMS Credits interfaces (mirror of types.ts)
interface SMSCredits {
  odUserId: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  totalFreeCredits: number;
  lastTopUpAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface SMSUsage {
  messageId: string;
  tournamentId?: string;
  leagueId?: string;
  recipientPhone: string;
  recipientName?: string;
  segments: number;      // V07.50: 1 or 2
  creditsUsed: number;
  createdAt: number;
}

// ============================================
// SMS COST CALCULATOR
// ============================================

/**
 * Compute SMS cost based on message length (segment-based pricing)
 * - ≤160 chars = 1 segment = 1 credit
 * - 161-320 chars = 2 segments = 2 credits
 * - >320 chars = rejected (UI should prevent this)
 */
function computeSmsCost(body: string): { segments: number; cost: number } {
  const length = body.trim().length;

  if (length === 0) {
    throw new Error('Message body is empty');
  }

  const segments = Math.ceil(length / SMS_CHAR_LIMIT);

  if (segments > MAX_SMS_SEGMENTS) {
    throw new MessageTooLongError(segments);
  }

  // Cost = 1 credit per segment
  return { segments, cost: segments };
}

// ============================================
// SMS CREDITS HELPERS
// ============================================

/**
 * Get or create SMS credits for a user
 */
async function getOrCreateSMSCredits(
  db: admin.firestore.Firestore,
  userId: string
): Promise<SMSCredits> {
  const creditsRef = db.collection('sms_credits').doc(userId);
  const snap = await creditsRef.get();

  if (snap.exists) {
    return snap.data() as SMSCredits;
  }

  // Create new credits document with free starter credits
  const now = Date.now();
  const newCredits: SMSCredits = {
    odUserId: userId,
    balance: FREE_STARTER_SMS_CREDITS,
    totalPurchased: 0,
    totalUsed: 0,
    totalFreeCredits: FREE_STARTER_SMS_CREDITS,
    createdAt: now,
    updatedAt: now,
  };

  await creditsRef.set(newCredits);
  console.log(`Created SMS credits for user ${userId} with ${FREE_STARTER_SMS_CREDITS} free credits`);
  return newCredits;
}

/**
 * Reserve SMS credits BEFORE sending (transactional)
 * THROWS InsufficientCreditsError if balance < cost
 *
 * V07.50: This must be called BEFORE sending SMS to prevent race conditions
 * where multiple concurrent sends could overdraw the balance.
 */
async function reserveCredits(
  db: admin.firestore.Firestore,
  userId: string,
  cost: number,
  metadata: {
    messageId: string;
    tournamentId?: string;
    leagueId?: string;
    recipientPhone: string;
    recipientName?: string;
    segments: number;
  }
): Promise<{ newBalance: number; usageId: string }> {
  const creditsRef = db.collection('sms_credits').doc(userId);

  // First ensure the credits doc exists
  await getOrCreateSMSCredits(db, userId);

  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(creditsRef);

    if (!snap.exists) {
      // Should not happen after getOrCreateSMSCredits, but be safe
      throw new Error('SMS credits document not found');
    }

    const credits = snap.data() as SMSCredits;

    // HARD CHECK: Throw if insufficient credits
    if (credits.balance < cost) {
      throw new InsufficientCreditsError(credits.balance, cost);
    }

    const newBalance = credits.balance - cost;
    const now = Date.now();

    // Deduct credits
    transaction.update(creditsRef, {
      balance: newBalance,
      totalUsed: credits.totalUsed + cost,
      lastUsedAt: now,
      updatedAt: now,
    });

    // Log usage - filter out undefined values (Firestore rejects undefined)
    const usageRef = db.collection('sms_credits').doc(userId).collection('usage').doc();
    const usage: Record<string, any> = {
      messageId: metadata.messageId,
      recipientPhone: metadata.recipientPhone,
      segments: metadata.segments,
      creditsUsed: cost,
      createdAt: now,
    };
    // Only add optional fields if they have values
    if (metadata.tournamentId) usage.tournamentId = metadata.tournamentId;
    if (metadata.leagueId) usage.leagueId = metadata.leagueId;
    if (metadata.recipientName) usage.recipientName = metadata.recipientName;
    transaction.set(usageRef, usage);

    return { newBalance, usageId: usageRef.id };
  });

  console.log(`Reserved ${cost} SMS credit(s) from user ${userId}. New balance: ${result.newBalance}`);
  return result;
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

    // Send without origin - SMSGlobal will use default sender
    // Alphanumeric sender IDs require registration in SMSGlobal dashboard
    const requestBody: Record<string, string> = {
      destination: to,
      message: body,
    };

    // Only add origin if it's a valid phone number (registered sender IDs need dashboard setup)
    if (origin.startsWith('+') && /^\+\d{10,15}$/.test(origin)) {
      requestBody.origin = origin;
    }
    // Otherwise, SMSGlobal uses default sender from account settings

    const response = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
// HELPER: Send Email via Amazon SES
// ============================================

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  htmlBody?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const sesConfig = getSESConfig();

    const client = new SESClient({
      region: sesConfig.region,
      credentials: {
        accessKeyId: sesConfig.accessKeyId,
        secretAccessKey: sesConfig.secretAccessKey,
      },
    });

    console.log(`Sending email to ${to} via Amazon SES (from: ${sesConfig.fromEmail})`);

    const command = new SendEmailCommand({
      Source: sesConfig.fromEmail,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8',
          },
          ...(htmlBody ? { Html: { Data: htmlBody, Charset: 'UTF-8' } } : {}),
        },
      },
    });

    const response = await client.send(command);
    console.log(`Email sent via SES. Message ID: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId };
  } catch (error: any) {
    console.error('SES error:', error.message);

    // Handle specific SES errors
    if (error.name === 'MessageRejected') {
      return { success: false, error: 'Email rejected by SES. Check sender verification.' };
    }
    if (error.name === 'MailFromDomainNotVerifiedException') {
      return { success: false, error: 'Sender email/domain not verified in SES.' };
    }
    if (error.name === 'ConfigurationSetDoesNotExistException') {
      return { success: false, error: 'SES configuration set not found.' };
    }
    if (error.code === 'InvalidParameterValue') {
      return { success: false, error: `Invalid email parameter: ${error.message}` };
    }

    return { success: false, error: error.message || 'Unknown SES error' };
  }
}

// ============================================
// SHARED PROCESSING LOGIC
// ============================================

/**
 * Process a comms queue message (shared logic for tournaments and leagues)
 *
 * V07.50 FLOW (reserve-before-send):
 * 1. Lock message doc
 * 2. Validate inputs
 * 3. Compute SMS cost (segments)
 * 4. RESERVE credits (transactional) - THROWS if insufficient
 * 5. Send SMS via SMSGlobal
 * 6. Update message status with smsSegments and smsCreditsUsed
 *
 * Credits are consumed even if send fails (MVP - no refunds)
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
  console.log(`Type: ${message.type}, Recipient: ${message.recipientName}, CreatedBy: ${message.createdBy}`);

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
  // STEP 2: Process the message
  // ========================================

  let result: { success: boolean; messageId?: string; error?: string };
  let smsSegments: number = 0;
  let smsCreditsUsed: number = 0;

  if (message.type === 'sms') {
    try {
      // ========================================
      // STEP 2a: Validate inputs
      // ========================================
      if (!message.recipientPhone) {
        throw new Error('No phone number provided');
      }
      if (!message.recipientPhone.startsWith('+')) {
        throw new Error('Invalid phone format. Must be E.164 (+XXXXXXXXXXX)');
      }
      if (!message.body || message.body.trim().length === 0) {
        throw new Error('Message body is empty');
      }
      if (!message.createdBy) {
        throw new Error('No createdBy user ID - cannot check SMS credits');
      }

      // ========================================
      // STEP 2b: Compute cost (segment-based)
      // ========================================
      const { segments, cost } = computeSmsCost(message.body);
      smsSegments = segments;
      console.log(`Message has ${segments} segment(s), cost: ${cost} credit(s)`);

      // ========================================
      // STEP 2c: RESERVE credits BEFORE sending
      // This is transactional and THROWS if insufficient
      // ========================================
      console.log(`Reserving ${cost} credit(s) for user ${message.createdBy}...`);
      await reserveCredits(db, message.createdBy, cost, {
        messageId,
        tournamentId: entityType === 'tournament' ? entityId : undefined,
        leagueId: entityType === 'league' ? entityId : undefined,
        recipientPhone: message.recipientPhone,
        recipientName: message.recipientName,
        segments,
      });
      smsCreditsUsed = cost;
      console.log(`Credits reserved successfully`);

      // ========================================
      // STEP 2d: Send SMS (credits already consumed)
      // ========================================
      result = await sendSMSViaSMSGlobal(
        message.recipientPhone,
        message.body,
        smsConfig.apiKey,
        smsConfig.apiSecret,
        smsConfig.origin
      );

      // Note: Credits are NOT refunded on send failure (MVP)
      if (!result.success) {
        console.log(`SMS send failed but ${cost} credit(s) were consumed (no refund)`);
      }

    } catch (error: any) {
      // Handle specific error types
      if (error instanceof InsufficientCreditsError) {
        console.error(`Insufficient credits: ${error.message}`);
        result = { success: false, error: 'Insufficient SMS credits. Please purchase more credits.' };
        smsCreditsUsed = 0; // No credits consumed
      } else if (error instanceof MessageTooLongError) {
        console.error(`Message too long: ${error.message}`);
        result = { success: false, error: error.message };
        smsCreditsUsed = 0;
      } else {
        console.error(`SMS processing error: ${error.message}`);
        result = { success: false, error: error.message };
        // If error happened after reservation, credits were consumed
        // smsCreditsUsed is already set if reservation succeeded
      }
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
  // STEP 3: Update status with cost tracking
  // ========================================

  try {
    if (result.success) {
      await docRef.update({
        status: 'sent' as CommsMessageStatus,
        sentAt: Date.now(),
        error: null,
        // V07.50: Track SMS cost
        smsSegments: smsSegments || null,
        smsCreditsUsed: smsCreditsUsed || null,
        providerMessageId: result.messageId || null,
        // Clear lock
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`Message ${messageId} sent successfully (${smsCreditsUsed} credit(s) used)`);
    } else {
      await docRef.update({
        status: 'failed' as CommsMessageStatus,
        failedAt: Date.now(),
        error: result.error || 'Unknown error',
        // V07.50: Track SMS cost (even on failure)
        smsSegments: smsSegments || null,
        smsCreditsUsed: smsCreditsUsed || null, // May be >0 if credits consumed before send failed
        providerMessageId: null,
        // Clear lock
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`Message ${messageId} failed: ${result.error} (${smsCreditsUsed} credit(s) consumed)`);

      // Optionally create a retry message if not already retried
      // BUT only if credits weren't consumed (don't double-charge on retry)
      if (!message.retried && smsCreditsUsed === 0) {
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
          smsSegments: null,
          smsCreditsUsed: null,
          providerMessageId: null,
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
