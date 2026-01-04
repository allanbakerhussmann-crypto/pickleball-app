"use strict";
/**
 * Tournament Communications Cloud Function
 *
 * Processes messages in the comms_queue subcollection.
 * Uses Firebase Functions v2 with Firestore triggers.
 *
 * FILE LOCATION: functions/src/comms.ts
 * VERSION: 07.08
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
exports.comms_processQueue = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const twilio_1 = __importDefault(require("twilio"));
// ============================================
// SECRETS (Functions v2)
// ============================================
const twilioSid = (0, params_1.defineSecret)('TWILIO_SID');
const twilioToken = (0, params_1.defineSecret)('TWILIO_TOKEN');
const twilioPhone = (0, params_1.defineSecret)('TWILIO_PHONE');
// ============================================
// HELPER: Send SMS via Twilio
// ============================================
async function sendSMSViaTwilio(to, body, sid, token, fromPhone) {
    try {
        const client = (0, twilio_1.default)(sid, token);
        const result = await client.messages.create({
            body,
            to,
            from: fromPhone,
        });
        console.log(`SMS sent successfully. Twilio SID: ${result.sid}`);
        return { success: true, twilioSid: result.sid };
    }
    catch (error) {
        console.error('Twilio error:', error.message);
        return { success: false, error: error.message || 'Unknown Twilio error' };
    }
}
// ============================================
// HELPER: Send Email (STUB)
// ============================================
async function sendEmail(_to, _subject, _body) {
    // TODO: Implement email sending via SendGrid or other provider
    console.log('Email sending not implemented yet');
    return {
        success: false,
        error: 'Email sending not implemented. Configure SendGrid integration.',
    };
}
// ============================================
// MAIN TRIGGER: Process Comms Queue
// ============================================
/**
 * Firestore onCreate trigger for comms_queue messages.
 *
 * When a message is created:
 * 1. Claims the document with a lock (prevents duplicate processing)
 * 2. Sends SMS via Twilio or Email (stubbed)
 * 3. Updates status to 'sent' or 'failed'
 */
exports.comms_processQueue = (0, firestore_1.onDocumentCreated)({
    document: 'tournaments/{tournamentId}/comms_queue/{messageId}',
    secrets: [twilioSid, twilioToken, twilioPhone],
}, async (event) => {
    const snap = event.data;
    if (!snap) {
        console.error('No data in event');
        return;
    }
    const message = snap.data();
    const messageId = event.params.messageId;
    const tournamentId = event.params.tournamentId;
    const docRef = snap.ref;
    console.log(`Processing comms message ${messageId} for tournament ${tournamentId}`);
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
            const data = doc.data();
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
    }
    catch (error) {
        console.error(`Error claiming message ${messageId}:`, error.message);
        return;
    }
    // ========================================
    // STEP 2: Send the message
    // ========================================
    let result;
    if (message.type === 'sms') {
        // Validate phone number
        if (!message.recipientPhone) {
            result = { success: false, error: 'No phone number provided' };
        }
        else if (!message.recipientPhone.startsWith('+')) {
            result = { success: false, error: 'Invalid phone format. Must be E.164 (+XXXXXXXXXXX)' };
        }
        else if (!message.body || message.body.trim().length === 0) {
            result = { success: false, error: 'Message body is empty' };
        }
        else {
            // Send SMS
            result = await sendSMSViaTwilio(message.recipientPhone, message.body, twilioSid.value(), twilioToken.value(), twilioPhone.value());
        }
    }
    else if (message.type === 'email') {
        // Validate email
        if (!message.recipientEmail) {
            result = { success: false, error: 'No email address provided' };
        }
        else if (!message.subject) {
            result = { success: false, error: 'Email subject is required' };
        }
        else {
            // Send email (stubbed)
            result = await sendEmail(message.recipientEmail, message.subject, message.body);
        }
    }
    else {
        result = { success: false, error: `Unknown message type: ${message.type}` };
    }
    // ========================================
    // STEP 3: Update status
    // ========================================
    try {
        if (result.success) {
            await docRef.update({
                status: 'sent',
                sentAt: Date.now(),
                error: null,
                // Clear lock
                lockedAt: null,
                lockedBy: null,
            });
            console.log(`Message ${messageId} sent successfully`);
        }
        else {
            await docRef.update({
                status: 'failed',
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
                const retryRef = db.collection('tournaments').doc(tournamentId)
                    .collection('comms_queue').doc();
                await retryRef.set(Object.assign(Object.assign({}, message), { status: 'pending', createdAt: Date.now(), sentAt: null, failedAt: null, error: null, lockedAt: null, lockedBy: null, retried: true, retryOf: messageId }));
                console.log(`Retry message created: ${retryRef.id}`);
            }
        }
    }
    catch (error) {
        console.error(`Error updating message ${messageId} status:`, error.message);
    }
});
//# sourceMappingURL=comms.js.map