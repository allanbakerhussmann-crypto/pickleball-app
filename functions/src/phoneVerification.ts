/**
 * Phone Verification Cloud Functions
 *
 * Handles SMS-based phone number verification with OTP codes.
 * Uses SMSGlobal infrastructure via sms_messages collection.
 *
 * FILE LOCATION: functions/src/phoneVerification.ts
 * VERSION: 06.18
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

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
const generateCode = (length: number): string => {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

/**
 * Hash a code for secure storage
 */
const hashCode = (code: string): string => {
  return crypto.createHash('sha256').update(code).digest('hex');
};

/**
 * Validate E.164 phone format
 */
const isValidE164 = (phone: string): boolean => {
  // E.164: + followed by 1-15 digits
  return /^\+[1-9]\d{1,14}$/.test(phone);
};

// ============================================
// Send Verification Code
// ============================================

interface SendCodeRequest {
  phone: string;
}

interface SendCodeResponse {
  success: boolean;
  message: string;
  expiresIn?: number; // seconds
}

/**
 * Send a verification code to a phone number
 *
 * - Validates phone format
 * - Checks rate limits
 * - Generates and stores hashed code
 * - Sends SMS via sms_messages collection trigger
 */
export const phone_sendVerificationCode = functions.https.onCall(
  async (data: SendCodeRequest, context): Promise<SendCodeResponse> => {
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
  }
);

// ============================================
// Verify Code
// ============================================

interface VerifyCodeRequest {
  phone: string;
  code: string;
}

interface VerifyCodeResponse {
  success: boolean;
  message: string;
}

/**
 * Verify a phone number with the provided code
 *
 * - Validates code against stored hash
 * - Checks expiry and attempt limits
 * - Updates user profile on success
 */
export const phone_verifyCode = functions.https.onCall(
  async (data: VerifyCodeRequest, context): Promise<VerifyCodeResponse> => {
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
  }
);
