/**
 * PhoneRequiredModal - Collects phone number when joining leagues/tournaments
 *
 * Shows when a user without a phone number tries to join organised play.
 * Phone is saved to profile, verification is offered but skippable.
 *
 * @version 07.50
 * @file components/shared/PhoneRequiredModal.tsx
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PhoneInput } from './PhoneInput';

interface PhoneRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (phone: string) => void;
  context: 'league' | 'tournament';
}

export const PhoneRequiredModal: React.FC<PhoneRequiredModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  context,
}) => {
  const { updateUserExtendedProfile } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const contextText = context === 'league' ? 'league' : 'tournament';

  const handleSubmit = async () => {
    // Validate phone
    if (!phone || !phone.startsWith('+') || phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Save phone to profile
      await updateUserExtendedProfile({ phone, phoneVerified: false });

      // Call onComplete with the phone number
      onComplete(phone);
    } catch (err: any) {
      console.error('Error saving phone:', err);
      setError('Failed to save phone number. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md m-4 relative border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl"
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="text-2xl font-bold text-center mb-2 text-green-400">
          Mobile Number Required
        </h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          We need your mobile number to send you match schedules, court assignments,
          and other important updates for this {contextText}.
        </p>

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
              You can verify your number later from your Profile
            </p>
          </div>

          {error && (
            <div className="bg-red-900/20 p-3 rounded">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !phone.trim()}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>

          <button
            onClick={onClose}
            className="w-full text-gray-400 hover:text-white py-2 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
