/**
 * DeleteAccountModal - Account Deletion Confirmation
 *
 * Allows users to delete their account and all associated data.
 * Required for Privacy Act 2020 compliance (Right to Deletion).
 *
 * FILE LOCATION: components/profile/DeleteAccountModal.tsx
 * VERSION: V06.04
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteAccount } from '../../services/firebase/accountDeletion';

interface DeleteAccountModalProps {
  onClose: () => void;
  userEmail: string;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  onClose,
  userEmail,
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'warning' | 'confirm' | 'deleting' | 'error'>('warning');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    setStep('deleting');
    setError(null);

    try {
      const result = await deleteAccount();

      if (result.success) {
        // Account deleted, redirect to home
        navigate('/');
      } else {
        setError(result.message);
        setStep('error');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setStep('error');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Delete Account</h2>
              <p className="text-gray-400 text-sm">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'warning' && (
            <>
              <p className="text-gray-300 mb-4">
                This action is <span className="text-red-400 font-semibold">permanent and cannot be undone</span>.
                Deleting your account will:
              </p>
              <ul className="text-gray-400 text-sm space-y-2 mb-6">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Remove your profile and personal information
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Cancel all tournament and league registrations
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Remove you from all meetups
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Delete your court bookings
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Disconnect your DUPR account
                </li>
              </ul>
              <p className="text-gray-500 text-xs mb-6">
                Note: Historical match results may be retained for record-keeping but will be anonymized.
                Paid registrations are non-refundable.
              </p>
              <button
                onClick={() => setStep('confirm')}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                I Understand, Continue
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <p className="text-gray-300 mb-4">
                To confirm deletion, please type <span className="font-mono text-red-400">DELETE</span> below:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type DELETE"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 font-mono text-center text-lg"
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
              )}
              <button
                onClick={handleDelete}
                disabled={confirmText !== 'DELETE'}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Permanently Delete My Account
              </button>
            </>
          )}

          {step === 'deleting' && (
            <div className="text-center py-8">
              <div className="animate-spin w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-300">Deleting your account...</p>
              <p className="text-gray-500 text-sm mt-2">This may take a moment</p>
            </div>
          )}

          {step === 'error' && (
            <>
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                If you continue to have issues, please contact support for assistance with account deletion.
              </p>
              <button
                onClick={() => setStep('confirm')}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Try Again
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        {step !== 'deleting' && (
          <div className="p-6 border-t border-gray-700">
            <button
              onClick={onClose}
              className="w-full text-gray-400 hover:text-white py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
