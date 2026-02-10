"use strict";
/**
 * Phone Verification Cloud Functions
 *
 * Handles SMS-based phone number verification with OTP codes.
 * Uses SMSGlobal infrastructure via sms_messages collection.
 *
 * FILE LOCATION: functions/src/phoneVerification.ts
 * VERSION: 06.18
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
exports.phone_verifyCode = exports.phone_sendVerificationCode = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const db = admin.firestore();
// ============================================
// Configuration
// ============================================
const CONFIG = {
    CODE_LENGTH: 6,
    CODE_EXPIRY_MINUTES: 10,
    MAX_ATTEMPTS: 3,
    RATE_LIMIT_CODES_PER_HOUR: 3,
    RATE_LIMIT_CODES_PER_DAY: 10,
};
// ============================================
// Helper Functions
// ============================================
/**
 * Generate a random numeric code
 */
const generateCode = (length) => {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10).toString();
    }
    return code;
};
/**
 * Hash a code for secure storage
 */
const hashCode = (code) => {
    return crypto.createHash('sha256').update(code).digest('hex');
};
/**
 * Validate E.164 phone format
 */
const isValidE164 = (phone) => {
    // E.164: + followed by 1-15 digits
    return /^\+[1-9]\d{1,14}$/.test(phone);
};
/**
 * Send a verification code to a phone number
 *
 * - Validates phone format
 * - Checks rate limits
 * - Generates and stores hashed code
 * - Sends SMS via sms_messages collection trigger
 */
exports.phone_sendVerificationCode = functions.https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to verify phone');
    }
    const userId = context.auth.uid;
    const { phone } = data;
    // Validate phone format
    if (!phone || !isValidE164(phone)) {
        return {
            success: false,
            message: 'Invalid phone number format. Use E.164 format (e.g., +64211234567)',
        };
    }
    // Check rate limits
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recentCodes = await db
        .collection('phone_verification_codes')
        .where('phone', '==', phone)
        .where('createdAt', '>', oneHourAgo)
        .get();
    if (recentCodes.size >= CONFIG.RATE_LIMIT_CODES_PER_HOUR) {
        return {
            success: false,
            message: 'Too many verification attempts. Please try again in an hour.',
        };
    }
    const dailyCodes = await db
        .collection('phone_verification_codes')
        .where('userId', '==', userId)
        .where('createdAt', '>', oneDayAgo)
        .get();
    if (dailyCodes.size >= CONFIG.RATE_LIMIT_CODES_PER_DAY) {
        return {
            success: false,
            message: 'Daily verification limit reached. Please try again tomorrow.',
        };
    }
    // Generate code
    const code = generateCode(CONFIG.CODE_LENGTH);
    const hashedCode = hashCode(code);
    const expiresAt = now + CONFIG.CODE_EXPIRY_MINUTES * 60 * 1000;
    // Store verification record
    const verificationRef = db.collection('phone_verification_codes').doc();
    await verificationRef.set({
        phone,
        userId,
        hashedCode,
        createdAt: now,
        expiresAt,
        attempts: 0,
        verified: false,
    });
    // Send SMS via existing infrastructure (triggers sendSMS function)
    await db.collection('sms_messages').add({
        to: phone,
        body: `Your Pickleball Director verification code is: ${code}\n\nThis code expires in ${CONFIG.CODE_EXPIRY_MINUTES} minutes.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        userId,
        notificationType: 'verification',
    });
    console.log(`Phone verification code sent to ${phone} for user ${userId}`);
    return {
        success: true,
        message: 'Verification code sent',
        expiresIn: CONFIG.CODE_EXPIRY_MINUTES * 60,
    };
});
/**
 * Verify a phone number with the provided code
 *
 * - Validates code against stored hash
 * - Checks expiry and attempt limits
 * - Updates user profile on success
 */
exports.phone_verifyCode = functions.https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to verify phone');
    }
    const userId = context.auth.uid;
    const { phone, code } = data;
    // Validate inputs
    if (!phone || !isValidE164(phone)) {
        return {
            success: false,
            message: 'Invalid phone number format',
        };
    }
    if (!code || code.length !== CONFIG.CODE_LENGTH) {
        return {
            success: false,
            message: 'Invalid verification code format',
        };
    }
    const now = Date.now();
    // Find the most recent verification record for this phone/user
    const codesSnapshot = await db
        .collection('phone_verification_codes')
        .where('phone', '==', phone)
        .where('userId', '==', userId)
        .where('verified', '==', false)
        .where('expiresAt', '>', now)
        .orderBy('expiresAt', 'desc')
        .limit(1)
        .get();
    if (codesSnapshot.empty) {
        return {
            success: false,
            message: 'No valid verification code found. Please request a new code.',
        };
    }
    const codeDoc = codesSnapshot.docs[0];
    const codeData = codeDoc.data();
    // Check attempts
    if (codeData.attempts >= CONFIG.MAX_ATTEMPTS) {
        return {
            success: false,
            message: 'Too many failed attempts. Please request a new code.',
        };
    }
    // Verify the code
    const hashedInput = hashCode(code);
    if (hashedInput !== codeData.hashedCode) {
        // Increment attempts
        await codeDoc.ref.update({
            attempts: admin.firestore.FieldValue.increment(1),
        });
        const remainingAttempts = CONFIG.MAX_ATTEMPTS - codeData.attempts - 1;
        return {
            success: false,
            message: remainingAttempts > 0
                ? `Invalid code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
                : 'Invalid code. Please request a new code.',
        };
    }
    // Code is valid - mark as verified
    await codeDoc.ref.update({
        verified: true,
        verifiedAt: now,
    });
    // Update user profile
    await db.collection('users').doc(userId).update({
        phone,
        phoneVerified: true,
        phoneVerifiedAt: now,
        updatedAt: now,
    });
    console.log(`Phone ${phone} verified for user ${userId}`);
    return {
        success: true,
        message: 'Phone number verified successfully',
    };
});
//# sourceMappingURL=phoneVerification.js.map