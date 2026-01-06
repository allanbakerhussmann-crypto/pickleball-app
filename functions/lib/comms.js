"use strict";
/**
 * Communications Cloud Function
 *
 * Processes messages in the comms_queue subcollection for both
 * tournaments and leagues.
 * Uses Firebase Functions v1 with Firestore triggers.
 *
 * FILE LOCATION: functions/src/comms.ts
 * VERSION: 07.18
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
exports.comms_processLeagueQueue = exports.comms_processQueue = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const twilio_1 = __importDefault(require("twilio"));
// ============================================
// TWILIO CONFIG (Functions v1)
// ============================================
const getTwilioConfig = () => {
    var _a, _b, _c;
    const config = functions.config();
    if (!((_a = config.twilio) === null || _a === void 0 ? void 0 : _a.sid) || !((_b = config.twilio) === null || _b === void 0 ? void 0 : _b.token) || !((_c = config.twilio) === null || _c === void 0 ? void 0 : _c.phone)) {
        throw new Error('Twilio credentials not configured. Run: firebase functions:config:set twilio.sid="..." twilio.token="..." twilio.phone="+1..."');
    }
    return {
        sid: config.twilio.sid,
        token: config.twilio.token,
        phone: config.twilio.phone,
    };
};
// ============================================
// HELPER: Send SMS via Twilio
// ============================================
async function sendSMSViaTwilio(to, body, sid, token, fromPhone) {
    try {
        const client = (0, twilio_1.default)(sid, token);
        console.log(`Sending SMS to ${to} from ${fromPhone}`);
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
// SHARED PROCESSING LOGIC
// ============================================
/**
 * Process a comms queue message (shared logic for tournaments and leagues)
 */
async function processCommsMessage(snap, messageId, entityType, entityId, twilioSidValue, twilioTokenValue, twilioPhone) {
    const message = snap.data();
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
            result = await sendSMSViaTwilio(message.recipientPhone, message.body, twilioSidValue, twilioTokenValue, twilioPhone);
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
                // Determine collection path based on entity type
                const collectionPath = entityType === 'tournament'
                    ? db.collection('tournaments').doc(entityId).collection('comms_queue')
                    : db.collection('leagues').doc(entityId).collection('comms_queue');
                const retryRef = collectionPath.doc();
                await retryRef.set(Object.assign(Object.assign({}, message), { status: 'pending', createdAt: Date.now(), sentAt: null, failedAt: null, error: null, lockedAt: null, lockedBy: null, retried: true, retryOf: messageId }));
                console.log(`Retry message created: ${retryRef.id}`);
            }
        }
    }
    catch (error) {
        console.error(`Error updating message ${messageId} status:`, error.message);
    }
}
// ============================================
// TOURNAMENT TRIGGER: Process Tournament Comms Queue
// ============================================
/**
 * Firestore onCreate trigger for tournament comms_queue messages.
 */
exports.comms_processQueue = functions.firestore
    .document('tournaments/{tournamentId}/comms_queue/{messageId}')
    .onCreate(async (snap, context) => {
    const twilioConfig = getTwilioConfig();
    await processCommsMessage(snap, context.params.messageId, 'tournament', context.params.tournamentId, twilioConfig.sid, twilioConfig.token, twilioConfig.phone);
});
// ============================================
// LEAGUE TRIGGER: Process League Comms Queue
// ============================================
/**
 * Firestore onCreate trigger for league comms_queue messages.
 */
exports.comms_processLeagueQueue = functions.firestore
    .document('leagues/{leagueId}/comms_queue/{messageId}')
    .onCreate(async (snap, context) => {
    const twilioConfig = getTwilioConfig();
    await processCommsMessage(snap, context.params.messageId, 'league', context.params.leagueId, twilioConfig.sid, twilioConfig.token, twilioConfig.phone);
});
//# sourceMappingURL=comms.js.map