"use strict";
/**
 * Communications Cloud Function
 *
 * Processes messages in the comms_queue subcollection for both
 * tournaments and leagues.
 * Uses Firebase Functions v1 with Firestore triggers.
 * SMS provider: SMSGlobal (better NZ coverage than Twilio)
 *
 * SMS CREDITS SYSTEM (V07.19):
 * - Checks organizer's credit balance before sending SMS
 * - Deducts 1 credit per successful SMS sent
 * - Logs usage to sms_credits/{userId}/usage
 * - Fails message with "Insufficient SMS credits" if no credits
 *
 * FILE LOCATION: functions/src/comms.ts
 * VERSION: 07.19
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.comms_processLeagueQueue = exports.comms_processQueue = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
// ============================================
// SMS CREDITS CONSTANTS
// ============================================
const FREE_STARTER_SMS_CREDITS = 25;
// ============================================
// SMSGLOBAL CONFIG (Functions v1)
// ============================================
const getSMSGlobalConfig = () => {
    var _a, _b;
    const config = functions.config();
    if (!((_a = config.smsglobal) === null || _a === void 0 ? void 0 : _a.apikey) || !((_b = config.smsglobal) === null || _b === void 0 ? void 0 : _b.apisecret)) {
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
function generateMACAuth(apiKey, apiSecret, method, path, host, port = '443') {
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
// SMS CREDITS HELPERS
// ============================================
/**
 * Get or create SMS credits for a user
 */
async function getOrCreateSMSCredits(db, userId) {
    const creditsRef = db.collection('sms_credits').doc(userId);
    const snap = await creditsRef.get();
    if (snap.exists) {
        return snap.data();
    }
    // Create new credits document with free starter credits
    const now = Date.now();
    const newCredits = {
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
 * Check if user has sufficient SMS credits
 */
async function hasSufficientCredits(db, userId, count = 1) {
    const credits = await getOrCreateSMSCredits(db, userId);
    return credits.balance >= count;
}
/**
 * Deduct SMS credits and log usage (transactional)
 * Only call this AFTER successful SMS send
 */
async function deductCreditsAndLogUsage(db, userId, count, metadata) {
    const creditsRef = db.collection('sms_credits').doc(userId);
    try {
        const result = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(creditsRef);
            if (!snap.exists) {
                return { success: false, newBalance: 0, error: 'No credits document found' };
            }
            const credits = snap.data();
            if (credits.balance < count) {
                return {
                    success: false,
                    newBalance: credits.balance,
                    error: `Insufficient credits: ${credits.balance} available, ${count} required`,
                };
            }
            const newBalance = credits.balance - count;
            const now = Date.now();
            // Update credits
            transaction.update(creditsRef, {
                balance: newBalance,
                totalUsed: credits.totalUsed + count,
                lastUsedAt: now,
                updatedAt: now,
            });
            // Log usage
            const usageRef = db.collection('sms_credits').doc(userId).collection('usage').doc();
            const usage = {
                messageId: metadata.messageId,
                tournamentId: metadata.tournamentId,
                leagueId: metadata.leagueId,
                recipientPhone: metadata.recipientPhone,
                recipientName: metadata.recipientName,
                status: 'sent',
                creditsUsed: count,
                createdAt: now,
            };
            transaction.set(usageRef, usage);
            return { success: true, newBalance };
        });
        console.log(`Deducted ${count} SMS credit from user ${userId}. New balance: ${result.newBalance}`);
        return result;
    }
    catch (error) {
        console.error(`Error deducting credits for user ${userId}:`, error.message);
        return { success: false, newBalance: 0, error: error.message };
    }
}
// ============================================
// HELPER: Send SMS via SMSGlobal
// ============================================
async function sendSMSViaSMSGlobal(to, body, apiKey, apiSecret, origin) {
    var _a, _b;
    try {
        const host = 'api.smsglobal.com';
        const path = '/v2/sms';
        const authHeader = generateMACAuth(apiKey, apiSecret, 'POST', path, host);
        console.log(`Sending SMS to ${to} via SMSGlobal (origin: ${origin})`);
        // Send without origin - SMSGlobal will use default sender
        // Alphanumeric sender IDs require registration in SMSGlobal dashboard
        const requestBody = {
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
            const data = await response.json();
            const messageId = (_b = (_a = data.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id;
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
    }
    catch (error) {
        console.error('SMSGlobal error:', error.message);
        return { success: false, error: error.message || 'Unknown SMSGlobal error' };
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
 *
 * For SMS messages:
 * 1. Check if organizer (createdBy) has sufficient SMS credits
 * 2. If no credits, fail the message with "Insufficient SMS credits"
 * 3. If has credits, send SMS
 * 4. On successful send, deduct 1 credit and log usage
 */
async function processCommsMessage(snap, messageId, entityType, entityId, smsConfig) {
    const message = snap.data();
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
        else if (!message.createdBy) {
            result = { success: false, error: 'No createdBy user ID - cannot check SMS credits' };
        }
        else {
            // Check SMS credits BEFORE sending
            const hasCredits = await hasSufficientCredits(db, message.createdBy, 1);
            if (!hasCredits) {
                console.log(`User ${message.createdBy} has insufficient SMS credits`);
                result = {
                    success: false,
                    error: 'Insufficient SMS credits. Please purchase more credits to send SMS.',
                };
            }
            else {
                // Send SMS via SMSGlobal
                result = await sendSMSViaSMSGlobal(message.recipientPhone, message.body, smsConfig.apiKey, smsConfig.apiSecret, smsConfig.origin);
                // If SMS sent successfully, deduct credits and log usage
                if (result.success) {
                    const deductResult = await deductCreditsAndLogUsage(db, message.createdBy, 1, {
                        messageId,
                        tournamentId: entityType === 'tournament' ? entityId : undefined,
                        leagueId: entityType === 'league' ? entityId : undefined,
                        recipientPhone: message.recipientPhone,
                        recipientName: message.recipientName,
                    });
                    if (!deductResult.success) {
                        // Credit deduction failed but SMS was sent - log but don't fail the message
                        console.error(`Warning: SMS sent but credit deduction failed: ${deductResult.error}`);
                    }
                }
            }
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
    const smsConfig = getSMSGlobalConfig();
    await processCommsMessage(snap, context.params.messageId, 'tournament', context.params.tournamentId, smsConfig);
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
    const smsConfig = getSMSGlobalConfig();
    await processCommsMessage(snap, context.params.messageId, 'league', context.params.leagueId, smsConfig);
});
//# sourceMappingURL=comms.js.map