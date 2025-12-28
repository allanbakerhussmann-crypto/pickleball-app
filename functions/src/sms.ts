/**
 * SMS Cloud Function - Twilio Integration
 *
 * Sends SMS messages via Twilio when documents are created in the sms_messages collection.
 *
 * FILE LOCATION: functions/src/sms.ts
 * VERSION: 06.17
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import twilio from 'twilio';

// Initialize Twilio client with config
const getTwilioClient = () => {
  const config = functions.config();
  if (!config.twilio?.sid || !config.twilio?.token) {
    throw new Error('Twilio credentials not configured. Run: firebase functions:config:set twilio.sid="..." twilio.token="..." twilio.phone="..."');
  }
  return twilio(config.twilio.sid, config.twilio.token);
};

// ============================================
// SMS Message Types
// ============================================

interface SMSMessage {
  to: string;              // Phone number in E.164 format (+1XXXXXXXXXX)
  body: string;            // Message content
  createdAt: admin.firestore.Timestamp;
  status: 'pending' | 'sent' | 'failed';
  twilioSid?: string;      // Twilio message SID after sending
  sentAt?: admin.firestore.Timestamp;
  error?: string;          // Error message if failed

  // Optional metadata
  userId?: string;         // User who triggered the SMS
  eventType?: 'tournament' | 'league' | 'meetup';
  eventId?: string;
  notificationType?: 'court_assignment' | 'match_result' | 'reminder' | 'custom';
}

// ============================================
// Send SMS Function
// ============================================

/**
 * Trigger: Firestore document creation in sms_messages collection
 *
 * When a document is created in sms_messages, this function:
 * 1. Reads the phone number and message body
 * 2. Sends the SMS via Twilio
 * 3. Updates the document with delivery status
 */
export const sendSMS = functions.firestore
  .document('sms_messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data() as SMSMessage;
    const messageId = context.params.messageId;

    // Validate required fields
    if (!message.to || !message.body) {
      console.error(`SMS ${messageId}: Missing required fields (to: ${message.to}, body: ${!!message.body})`);
      await snap.ref.update({
        status: 'failed',
        error: 'Missing required fields: to and body are required',
      });
      return;
    }

    // Validate phone number format (basic E.164 check)
    if (!message.to.startsWith('+')) {
      console.error(`SMS ${messageId}: Invalid phone format. Must be E.164 format (+1XXXXXXXXXX)`);
      await snap.ref.update({
        status: 'failed',
        error: 'Invalid phone number format. Use E.164 format: +1XXXXXXXXXX',
      });
      return;
    }

    try {
      const twilioClient = getTwilioClient();
      const config = functions.config();

      console.log(`SMS ${messageId}: Sending to ${message.to}`);

      const result = await twilioClient.messages.create({
        body: message.body,
        to: message.to,
        from: config.twilio.phone,
      });

      console.log(`SMS ${messageId}: Sent successfully. Twilio SID: ${result.sid}`);

      // Update document with success status
      await snap.ref.update({
        status: 'sent',
        twilioSid: result.sid,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    } catch (error: any) {
      console.error(`SMS ${messageId}: Failed to send. Error:`, error.message);

      // Update document with failure status
      await snap.ref.update({
        status: 'failed',
        error: error.message || 'Unknown error occurred',
      });
    }
  });

// ============================================
// Bulk SMS Function (HTTP Callable)
// ============================================

interface BulkSMSRequest {
  recipients: Array<{
    phone: string;
    name?: string;
  }>;
  message: string;
  eventType?: 'tournament' | 'league' | 'meetup';
  eventId?: string;
}

/**
 * HTTP Callable function for sending bulk SMS
 * Used by organizers to text all players at once
 */
export const sendBulkSMS = functions.https.onCall(async (data: BulkSMSRequest, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to send SMS');
  }

  const { recipients, message, eventType, eventId } = data;

  if (!recipients || recipients.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No recipients provided');
  }

  if (!message || message.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Message is required');
  }

  // Limit bulk SMS to prevent abuse (100 per call)
  if (recipients.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum 100 recipients per request');
  }

  const batch = admin.firestore().batch();
  const smsCollection = admin.firestore().collection('sms_messages');
  const now = admin.firestore.FieldValue.serverTimestamp();

  let validCount = 0;
  let invalidCount = 0;

  for (const recipient of recipients) {
    if (!recipient.phone || !recipient.phone.startsWith('+')) {
      invalidCount++;
      continue;
    }

    const docRef = smsCollection.doc();
    batch.set(docRef, {
      to: recipient.phone,
      body: message,
      createdAt: now,
      status: 'pending',
      userId: context.auth.uid,
      eventType,
      eventId,
      notificationType: 'custom',
    });
    validCount++;
  }

  if (validCount > 0) {
    await batch.commit();
  }

  return {
    success: true,
    sent: validCount,
    invalid: invalidCount,
    message: `Queued ${validCount} SMS messages for delivery`,
  };
});
