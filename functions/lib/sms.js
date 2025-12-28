"use strict";
/**
 * SMS Cloud Function - Twilio Integration
 *
 * Sends SMS messages via Twilio when documents are created in the sms_messages collection.
 *
 * FILE LOCATION: functions/src/sms.ts
 * VERSION: 06.17
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBulkSMS = exports.sendSMS = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const twilio_1 = __importDefault(require("twilio"));
// Initialize Twilio client with config
const getTwilioClient = () => {
    var _a, _b;
    const config = functions.config();
    if (!((_a = config.twilio) === null || _a === void 0 ? void 0 : _a.sid) || !((_b = config.twilio) === null || _b === void 0 ? void 0 : _b.token)) {
        throw new Error('Twilio credentials not configured. Run: firebase functions:config:set twilio.sid="..." twilio.token="..." twilio.phone="..."');
    }
    return (0, twilio_1.default)(config.twilio.sid, config.twilio.token);
};
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
exports.sendSMS = functions.firestore
    .document('sms_messages/{messageId}')
    .onCreate(async (snap, context) => {
    const message = snap.data();
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
    }
    catch (error) {
        console.error(`SMS ${messageId}: Failed to send. Error:`, error.message);
        // Update document with failure status
        await snap.ref.update({
            status: 'failed',
            error: error.message || 'Unknown error occurred',
        });
    }
});
/**
 * HTTP Callable function for sending bulk SMS
 * Used by organizers to text all players at once
 */
exports.sendBulkSMS = functions.https.onCall(async (data, context) => {
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
//# sourceMappingURL=sms.js.map