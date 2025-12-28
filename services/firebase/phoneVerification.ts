/**
 * Phone Verification Service
 *
 * Frontend service for phone number verification via SMS OTP.
 * Calls Firebase Cloud Functions for secure code generation and verification.
 *
 * FILE LOCATION: services/firebase/phoneVerification.ts
 * VERSION: 06.18
 */

import { httpsCallable } from '@firebase/functions';
import { functions } from './config';

// ============================================
// Types
// ============================================

interface SendCodeResponse {
  success: boolean;
  message: string;
  expiresIn?: number;
}

interface VerifyCodeResponse {
  success: boolean;
  message: string;
}

// ============================================
// Phone Number Formatting
// ============================================

/**
 * Format phone number to E.164 format
 * Handles common NZ formats and US formats
 *
 * @param phone Raw phone input
 * @param defaultCountryCode Default country code (e.g., '+64' for NZ)
 * @returns E.164 formatted phone or null if invalid
 */
export const formatPhoneE164 = (phone: string, defaultCountryCode = '+64'): string | null => {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If already has +, validate and return
  if (cleaned.startsWith('+')) {
    // Basic E.164 validation: + followed by 1-15 digits
    if (/^\+[1-9]\d{1,14}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  // Handle NZ numbers (default)
  if (defaultCountryCode === '+64') {
    // Remove leading 0 if present (e.g., 021 -> 21)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // NZ mobile numbers are 8-9 digits after country code
    if (cleaned.length >= 8 && cleaned.length <= 9) {
      return `+64${cleaned}`;
    }
  }

  // Handle US numbers
  if (defaultCountryCode === '+1') {
    // US numbers are exactly 10 digits
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    // 11 digits starting with 1
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
  }

  // Try with default country code for other lengths
  if (cleaned.length >= 7 && cleaned.length <= 12) {
    const formatted = `${defaultCountryCode}${cleaned.startsWith('0') ? cleaned.substring(1) : cleaned}`;
    if (/^\+[1-9]\d{1,14}$/.test(formatted)) {
      return formatted;
    }
  }

  return null;
};

/**
 * Validate if a phone number can be formatted to E.164
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  return formatPhoneE164(phone) !== null;
};

/**
 * Format phone for display (with spaces)
 * e.g., +64211234567 -> +64 21 123 4567
 */
export const formatPhoneForDisplay = (phone: string): string => {
  if (!phone) return '';

  // If it's an NZ number
  if (phone.startsWith('+64')) {
    const number = phone.substring(3);
    if (number.length === 8) {
      return `+64 ${number.substring(0, 2)} ${number.substring(2, 5)} ${number.substring(5)}`;
    }
    if (number.length === 9) {
      return `+64 ${number.substring(0, 2)} ${number.substring(2, 5)} ${number.substring(5)}`;
    }
  }

  // If it's a US number
  if (phone.startsWith('+1')) {
    const number = phone.substring(2);
    if (number.length === 10) {
      return `+1 (${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
    }
  }

  // Default: just add spaces every 3-4 digits
  return phone;
};

// ============================================
// Cloud Function Calls
// ============================================

/**
 * Send a verification code to the specified phone number
 *
 * @param phone Phone number (will be formatted to E.164)
 * @returns Response with success status and message
 */
export const sendPhoneVerificationCode = async (phone: string): Promise<SendCodeResponse> => {
  const formattedPhone = formatPhoneE164(phone);

  if (!formattedPhone) {
    return {
      success: false,
      message: 'Invalid phone number format. Please check and try again.',
    };
  }

  try {
    const sendCode = httpsCallable<{ phone: string }, SendCodeResponse>(
      functions,
      'phone_sendVerificationCode'
    );

    const result = await sendCode({ phone: formattedPhone });
    return result.data;
  } catch (error: any) {
    console.error('Error sending verification code:', error);

    // Handle specific error codes
    if (error.code === 'functions/unauthenticated') {
      return {
        success: false,
        message: 'Please log in to verify your phone number.',
      };
    }

    return {
      success: false,
      message: error.message || 'Failed to send verification code. Please try again.',
    };
  }
};

/**
 * Verify a phone number with the provided code
 *
 * @param phone Phone number (will be formatted to E.164)
 * @param code 6-digit verification code
 * @returns Response with success status and message
 */
export const verifyPhoneCode = async (phone: string, code: string): Promise<VerifyCodeResponse> => {
  const formattedPhone = formatPhoneE164(phone);

  if (!formattedPhone) {
    return {
      success: false,
      message: 'Invalid phone number format.',
    };
  }

  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return {
      success: false,
      message: 'Please enter a valid 6-digit code.',
    };
  }

  try {
    const verify = httpsCallable<{ phone: string; code: string }, VerifyCodeResponse>(
      functions,
      'phone_verifyCode'
    );

    const result = await verify({ phone: formattedPhone, code });
    return result.data;
  } catch (error: any) {
    console.error('Error verifying code:', error);

    if (error.code === 'functions/unauthenticated') {
      return {
        success: false,
        message: 'Please log in to verify your phone number.',
      };
    }

    return {
      success: false,
      message: error.message || 'Failed to verify code. Please try again.',
    };
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a user profile has a verified phone number
 */
export const isPhoneVerified = (userProfile: { phoneVerified?: boolean } | null): boolean => {
  return userProfile?.phoneVerified === true;
};

/**
 * Check if a user can receive SMS notifications
 * Requires both a phone number and verification
 */
export const canReceiveSMS = (userProfile: { phone?: string; phoneVerified?: boolean } | null): boolean => {
  return !!userProfile?.phone && userProfile?.phoneVerified === true;
};
