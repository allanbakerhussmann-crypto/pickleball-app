"use strict";
/**
 * SMS Cloud Function - SMSGlobal Integration
 *
 * Sends SMS messages via SMSGlobal when documents are created in the sms_messages collection.
 *
 * FILE LOCATION: functions/src/sms.ts
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
exports.sendBulkSMS = exports.sendSMS = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const envGuard_1 = require("./envGuard");
// ============================================
// SMSGLOBAL CONFIG
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
function generateMACAuth(apiKey, apiSecret, method, path, host, port = '443') {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const baseString = `${timestamp}\n${nonce}\n${method}\n${path}\n${host}\n${port}\n\n`;
    const mac = crypto.createHmac('sha256', apiSecret)
        .update(baseString)
        .digest('base64');
    return `MAC id="${apiKey}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
}
// ============================================
// SMSGLOBAL SEND FUNCTION
// ============================================
async function sendViaSMSGlobal(to, body, apiKey, apiSecret, origin) {
    var _a, _b;
    try {
        const host = 'api.smsglobal.com';
        const path = '/v2/sms';
        const authHeader = generateMACAuth(apiKey, apiSecret, 'POST', path, host);
        // Send without origin - SMSGlobal will use default sender
        const requestBody = {
            destination: to,
            message: body,
        };
        // Only add origin if it's a valid phone number
        if (origin.startsWith('+') && /^\+\d{10,15}$/.test(origin)) {
            requestBody.origin = origin;
        }
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
            return { success: true, messageId: (_b = (_a = data.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id };
        }
        const errorText = await response.text();
        return { success: false, error: `SMSGlobal error: ${response.status} - ${errorText}` };
    }
    catch (error) {
        return { success: false, error: error.message || 'Unknown SMSGlobal error' };
    }
}
// ============================================
// Send SMS Function
// ============================================
/**
 * Trigger: Firestore document creation in sms_messages collection
 *
 * When a document is created in sms_messages, this function:
 * 1. Reads the phone number and message body
 * 2. Sends the SMS via SMSGlobal
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
        const smsConfig = getSMSGlobalConfig();
        // Add [TEST] prefix for test environment
        const messageBody = envGuard_1.isTestProject ? `[TEST] ${message.body}` : message.body;
        console.log(`SMS ${messageId}: Sending to ${message.to} via SMSGlobal${envGuard_1.isTestProject ? ' (TEST MODE)' : ''}`);
        const result = await sendViaSMSGlobal(message.to, messageBody, smsConfig.apiKey, smsConfig.apiSecret, smsConfig.origin);
        if (result.success) {
            console.log(`SMS ${messageId}: Sent successfully. SMSGlobal ID: ${result.messageId}`);
            await snap.ref.update({
                status: 'sent',
                messageId: result.messageId,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else {
            console.error(`SMS ${messageId}: Failed to send. Error:`, result.error);
            await snap.ref.update({
                status: 'failed',
                error: result.error || 'Unknown error occurred',
            });
        }
    }
    catch (error) {
        console.error(`SMS ${messageId}: Failed to send. Error:`, error.message);
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
        console.log(`Bulk SMS: Queued ${validCount} messages${envGuard_1.isTestProject ? ' (TEST MODE - will have [TEST] prefix)' : ''}`);
    }
    return {
        success: true,
        sent: validCount,
        invalid: invalidCount,
        message: `Queued ${validCount} SMS messages for delivery${envGuard_1.isTestProject ? ' (TEST MODE)' : ''}`,
    };
});
//# sourceMappingURL=sms.js.map