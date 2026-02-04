/**
 * PhoneVerificationModal - SMS-based phone number verification
 *
 * Two-step modal:
 * 1. Enter phone number and send verification code
 * 2. Enter 6-digit code to verify
 *
 * @version 06.18
 * @file components/auth/PhoneVerificationModal.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  sendPhoneVerificationCode,
  verifyPhoneCode,
} from '../../services/firebase/phoneVerification';
import { PhoneInput } from '../shared/PhoneInput';
import { ModalShell } from '../shared/ModalShell';

interface PhoneVerificationModalProps {
  onClose: () => void;
  onVerified?: () => void;
  initialPhone?: string;
  canSkip?: boolean;
  skipLabel?: string;
}

export const PhoneVerificationModal: React.FC<PhoneVerificationModalProps> = ({
  onClose,
  onVerified,
  initialPhone = '',
  canSkip = true,
  skipLabel = 'Skip for now',
}) => {
  // Step: 'phone' for entering number, 'code' for entering verification code
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Refs for code input fields
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Focus first code input when entering code step
  useEffect(() => {
    if (step === 'code' && codeInputRefs.current[0]) {
      codeInputRefs.current[0].focus();
    }
  }, [step]);

  const handleSendCode = async () => {
    // Phone is already in E.164 format from PhoneInput
    if (!phone || !phone.startsWith('+') || phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await sendPhoneVerificationCode(phone);

    setLoading(false);

    if (result.success) {
      setStep('code');
      setResendTimer(60); // 60 second cooldown
      setSuccess('Verification code sent!');
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.message);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;

    setLoading(true);
    setError(null);
    setCode(['', '', '', '', '', '']);

    const result = await sendPhoneVerificationCode(phone);

    setLoading(false);

    if (result.success) {
      setResendTimer(60);
      setSuccess('New code sent!');
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.message);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-advance to next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace - go to previous input
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      setCode(pastedData.split(''));
      codeInputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const codeString = code.join('');
    if (codeString.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await verifyPhoneCode(phone, codeString);

    setLoading(false);

    if (result.success) {
      setSuccess('Phone verified successfully!');
      setTimeout(() => {
        onVerified?.();
        onClose();
      }, 1500);
    } else {
      setError(result.message);
      // Clear code on error
      setCode(['', '', '', '', '', '']);
      codeInputRefs.current[0]?.focus();
    }
  };

  const handleChangeNumber = () => {
    setStep('phone');
    setCode(['', '', '', '', '', '']);
    setError(null);
  };

  return (
    <ModalShell isOpen={true} onClose={onClose}>
        <div className="p-6 sm:p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl"
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="text-2xl font-bold text-center mb-2 text-green-400">
          Verify Phone Number
        </h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          {step === 'phone'
            ? 'Enter your phone number to receive SMS notifications'
            : `Enter the 6-digit code sent to ${phone}`}
        </p>

        {step === 'phone' ? (
          // Step 1: Phone number entry
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Phone Number
              </label>
              <PhoneInput
                value={phone}
                onChange={(e164Value) => setPhone(e164Value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                We'll send a verification code to this number
              </p>
            </div>

            {error && (
              <div className="bg-red-900/20 p-3 rounded">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-900/20 p-3 rounded">
                <p className="text-green-400 text-sm text-center">{success}</p>
              </div>
            )}

            <button
              onClick={handleSendCode}
              disabled={loading || !phone.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>

            {canSkip && (
              <button
                onClick={onClose}
                className="w-full text-gray-400 hover:text-white py-2 text-sm transition-colors"
              >
                {skipLabel}
              </button>
            )}
          </div>
        ) : (
          // Step 2: Code entry
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3 text-center">
                Verification Code
              </label>
              <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { codeInputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className="w-12 h-14 bg-gray-700 text-white text-center text-2xl font-bold rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-900/20 p-3 rounded">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-900/20 p-3 rounded">
                <p className="text-green-400 text-sm text-center">{success}</p>
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={loading || code.join('').length !== 6}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <div className="flex justify-between items-center text-sm">
              <button
                onClick={handleChangeNumber}
                className="text-gray-400 hover:text-white transition-colors"
              >
                Change number
              </button>
              <button
                onClick={handleResendCode}
                disabled={resendTimer > 0 || loading}
                className={`transition-colors ${
                  resendTimer > 0
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-green-400 hover:text-green-300'
                }`}
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
              </button>
            </div>

            {canSkip && (
              <button
                onClick={onClose}
                className="w-full text-gray-400 hover:text-white py-2 text-sm transition-colors mt-2"
              >
                {skipLabel}
              </button>
            )}
          </div>
        )}
        </div>
    </ModalShell>
  );
};
