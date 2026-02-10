/**
 * AddGuestModal - Add a walk-in guest to a meetup
 *
 * Guests live in /guests subcollection, NOT in RSVP docs.
 * MVP: Cash only. V2: Card via Stripe checkout.
 *
 * @version 07.61
 * @file components/meetups/AddGuestModal.tsx
 */

import React, { useState } from 'react';
import { addCashGuest } from '../../services/firebase/meetupAttendance';

interface AddGuestModalProps {
  meetupId: string;
  defaultAmount: number; // cents
  onClose: () => void;
  onAdded: () => void;
}

export const AddGuestModal: React.FC<AddGuestModalProps> = ({
  meetupId,
  defaultAmount,
  onClose,
  onAdded,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(defaultAmount / 100); // display in dollars
  const [notes, setNotes] = useState('');
  const [emailConsent, setEmailConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Guest name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await addCashGuest(meetupId, {
        name: name.trim(),
        email: email.trim() || undefined,
        amount: Math.round(amount * 100), // convert to cents
        notes: notes.trim() || undefined,
        emailConsent: email.trim() ? emailConsent : undefined,
      });
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add guest');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-white font-semibold text-lg">Add Guest</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Guest Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tom Smith"
              className="w-full bg-gray-800 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-lime-500 placeholder-gray-500"
              autoFocus
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tom@email.com"
              className="w-full bg-gray-800 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-lime-500 placeholder-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">For receipt & future event invites</p>
            {email.trim() && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={e => setEmailConsent(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-lime-500 focus:ring-lime-500"
                />
                <span className="text-xs text-gray-400">Guest consents to receive future event emails</span>
              </label>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Amount</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmount(Math.max(0, amount - 0.5))}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
              >
                -
              </button>
              <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                <span className="text-lime-400 text-xl font-bold font-mono">
                  ${amount.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAmount(Math.min(100, amount + 0.5))}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Payment Method</label>
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 p-3 rounded-lg border border-lime-500 bg-lime-900/30 text-lime-400 text-center"
              >
                Cash
              </button>
              <button
                type="button"
                disabled
                className="flex-1 p-3 rounded-lg border border-gray-600 text-gray-500 text-center opacity-50 cursor-not-allowed"
              >
                Card (V2)
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Friend of Sarah"
              className="w-full bg-gray-800 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-lime-500 placeholder-gray-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="w-full bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Adding...
              </>
            ) : (
              `Add Guest - $${amount.toFixed(2)}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
