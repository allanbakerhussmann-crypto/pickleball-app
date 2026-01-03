/**
 * OrganizerAgreementBlockingModal Component V07.05
 *
 * Non-dismissible modal for existing organizers who need to accept
 * the updated agreement. Cannot be closed without accepting.
 *
 * FILE LOCATION: components/shared/OrganizerAgreementBlockingModal.tsx
 */

import React, { useState } from 'react';
import { OrganizerAgreementModal } from './OrganizerAgreementModal';
import { updateOrganizerAgreement } from '../../services/firebase/users';
import { useAuth } from '../../contexts/AuthContext';
import type { OrganizerAgreement } from '../../types';

export const OrganizerAgreementBlockingModal: React.FC = () => {
  const { currentUser, refreshUserProfile } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async (agreement: OrganizerAgreement) => {
    if (!currentUser) return;

    setUpdating(true);
    setError(null);

    try {
      await updateOrganizerAgreement(currentUser.uid, agreement);
      // Refresh user profile to update isOrganizerBlocked
      await refreshUserProfile();
    } catch (err: any) {
      console.error('Error updating agreement:', err);
      setError(err.message || 'Failed to update agreement. Please try again.');
      setUpdating(false);
    }
  };

  // This modal cannot be closed - user must accept to continue
  const handleClose = () => {
    // Do nothing - modal is non-dismissible
  };

  return (
    <>
      <OrganizerAgreementModal
        isOpen={true}
        onClose={handleClose}
        onAccept={handleAccept}
        mode="existing"
      />

      {/* Loading overlay */}
      {updating && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white">Updating agreement...</p>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] bg-red-900/90 text-white px-6 py-3 rounded-lg border border-red-600 shadow-lg">
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-red-300 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
};

export default OrganizerAgreementBlockingModal;
