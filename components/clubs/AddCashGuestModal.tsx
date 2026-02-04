/**
 * AddCashGuestModal Component
 *
 * Modal for organizers to add walk-in guests who are paying cash.
 * Used in the session manager when an organizer clicks "Add Guest (Cash)".
 *
 * Features:
 * - Name field (required)
 * - Email field (optional, with validation)
 * - Price picker with +/- buttons ($0.50 increments)
 * - Notes field (optional)
 *
 * @version 07.59
 * @file components/clubs/AddCashGuestModal.tsx
 */

import React, { useState } from 'react';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import type { AddCashGuestInput, AddCashGuestOutput } from '../../types/standingMeetup';
import { ModalShell } from '../shared/ModalShell';

// Get functions instance for australia-southeast1 region (where standingMeetup functions are deployed)
const functionsAU = getFunctions(getApp(), 'australia-southeast1');

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsAU, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}

interface AddCashGuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  standingMeetupId: string;
  occurrenceId: string;
  defaultAmount: number; // In cents (from meetup.billing.perSessionAmount)
  currency: string; // 'nzd', 'aud', 'usd'
  onGuestAdded?: (guestId: string) => void;
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AddCashGuestModal: React.FC<AddCashGuestModalProps> = ({
  isOpen,
  onClose,
  standingMeetupId,
  occurrenceId,
  defaultAmount,
  currency,
  onGuestAdded,
}) => {
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailConsent, setEmailConsent] = useState(false);
  const [amountCents, setAmountCents] = useState(defaultAmount);
  const [notes, setNotes] = useState('');

  // UI state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Currency formatting
  const getCurrencySymbol = (): string => {
    switch (currency.toLowerCase()) {
      case 'usd':
        return 'US$';
      case 'aud':
        return 'A$';
      default:
        return '$';
    }
  };

  const formatAmount = (cents: number): string => {
    return `${getCurrencySymbol()}${(cents / 100).toFixed(2)}`;
  };

  // Validate email if provided
  const isEmailValid = (): boolean => {
    if (!email.trim()) return true; // Optional field
    return EMAIL_REGEX.test(email.trim());
  };

  // Handle amount changes (in $0.50 increments = 50 cents)
  const incrementAmount = () => {
    setAmountCents((prev) => Math.min(10000, prev + 50)); // Max $100.00
  };

  const decrementAmount = () => {
    setAmountCents((prev) => Math.max(0, prev - 50)); // Min $0.00 (free entry allowed)
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Validate name
    if (!name.trim()) {
      setError('Please enter the guest name');
      return;
    }

    // Validate email if provided
    if (email.trim() && !isEmailValid()) {
      setError('Please enter a valid email address');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const addCashGuestFn = httpsCallable<AddCashGuestInput, AddCashGuestOutput>(
        functionsAU,
        'standingMeetup_addCashGuest'
      );

      const result = await addCashGuestFn({
        standingMeetupId,
        occurrenceId,
        name: name.trim(),
        email: email.trim() || undefined,
        amount: amountCents,
        notes: notes.trim() || undefined,
        emailConsent: email.trim() ? emailConsent : undefined,
      });

      // Success - close modal and notify parent
      onGuestAdded?.(result.data.guestId);
      onClose();

      // Reset form
      setName('');
      setEmail('');
      setEmailConsent(false);
      setAmountCents(defaultAmount);
      setNotes('');
    } catch (err: any) {
      console.error('Add cash guest error:', err);

      // Parse error message
      let errorMessage = err.message || 'Failed to add guest';

      if (errorMessage.includes('GUEST_NAME_REQUIRED')) {
        errorMessage = 'Guest name is required';
      } else if (errorMessage.includes('INVALID_AMOUNT')) {
        errorMessage = 'Invalid payment amount';
      } else if (errorMessage.includes('MEETUP_NOT_FOUND')) {
        errorMessage = 'Meetup not found';
      } else if (errorMessage.includes('OCCURRENCE_NOT_FOUND')) {
        errorMessage = 'Session not found';
      } else if (errorMessage.includes('SESSION_ALREADY_CLOSED')) {
        errorMessage = 'This session has already been closed';
      } else if (errorMessage.includes('NOT_CLUB_ADMIN')) {
        errorMessage = 'You do not have permission to add guests';
      }

      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose}>
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-white">Add Cash Guest</h2>
            <p className="text-gray-400 text-sm">Walk-in paying with cash</p>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-gray-400 hover:text-white p-1 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter guest name"
              disabled={processing}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500 disabled:opacity-50"
            />
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guest@example.com"
              disabled={processing}
              className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white placeholder-gray-500 focus:outline-none disabled:opacity-50 ${
                email.trim() && !isEmailValid()
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-600 focus:border-lime-500'
              }`}
            />
            {email.trim() && !isEmailValid() && (
              <p className="mt-1 text-xs text-red-400">Please enter a valid email address</p>
            )}
          </div>

          {/* Email Consent - only show when email is provided */}
          {email.trim() && isEmailValid() && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailConsent}
                onChange={(e) => setEmailConsent(e.target.checked)}
                disabled={processing}
                className="mt-1 w-4 h-4 rounded border-gray-600 text-lime-500 focus:ring-lime-500 bg-gray-700"
              />
              <span className="text-sm text-gray-300">
                Guest agrees to receive session reminders and event updates via email
              </span>
            </label>
          )}

          {/* Amount Field - Price Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Amount</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={decrementAmount}
                disabled={processing || amountCents <= 0}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed border border-gray-600 rounded-lg text-white text-2xl font-bold flex items-center justify-center transition-colors"
              >
                -
              </button>
              <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                <span className="text-lime-400 text-xl font-bold font-mono">
                  {formatAmount(amountCents)}
                </span>
              </div>
              <button
                type="button"
                onClick={incrementAmount}
                disabled={processing || amountCents >= 10000}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed border border-gray-600 rounded-lg text-white text-2xl font-bold flex items-center justify-center transition-colors"
              >
                +
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">$0.50 increments</p>
          </div>

          {/* Notes Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Notes <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              disabled={processing}
              rows={2}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500 disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 space-y-3">
          {/* Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Cash received:</span>
            <span className="text-lime-400 font-bold text-lg">{formatAmount(amountCents)}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={processing}
              className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={processing || !name.trim() || (email.trim() !== '' && !isEmailValid())}
              className="flex-1 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Adding...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Guest
                </>
              )}
            </button>
          </div>
        </div>
      </ModalShell>
  );
};

export default AddCashGuestModal;
