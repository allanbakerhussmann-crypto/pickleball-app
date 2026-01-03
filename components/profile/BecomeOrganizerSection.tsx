/**
 * BecomeOrganizerSection Component V07.05
 *
 * Profile page section for organizer status and request flow.
 * Shows different states based on user's organizer status.
 *
 * States:
 * 1. Not an organizer, no pending request - Show "Apply to Become an Organizer" button
 * 2. Pending request - Show "Request Pending" status
 * 3. Rejected request - Show "Request Denied" with reason, option to reapply
 * 4. Is organizer, agreement current - Show "Verified Organizer" badge
 * 5. Is organizer, agreement outdated - Show warning + "Update Agreement" button
 *
 * FILE LOCATION: components/profile/BecomeOrganizerSection.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizerAgreementModal } from '../shared/OrganizerAgreementModal';
import { OrganizerRequestForm } from './OrganizerRequestForm';
import { getOrganizerRequestByUserId } from '../../services/firebase/organizerRequests';
import { updateOrganizerAgreement } from '../../services/firebase/users';
import { isAgreementCurrent, CURRENT_ORGANIZER_AGREEMENT_VERSION } from '../../constants/organizerAgreement';
import type { OrganizerAgreement } from '../../types';

interface OrganizerRequestData {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  denialReason?: string;
  reviewedAt?: number;
}

export const BecomeOrganizerSection: React.FC = () => {
  const { currentUser, userProfile, isOrganizer, refreshUserProfile } = useAuth();
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [pendingAgreement, setPendingAgreement] = useState<OrganizerAgreement | null>(null);
  const [existingRequest, setExistingRequest] = useState<OrganizerRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing organizer request on mount
  useEffect(() => {
    const fetchRequest = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const request = await getOrganizerRequestByUserId(currentUser.uid);
        if (request) {
          setExistingRequest({
            id: request.id,
            status: request.status,
            createdAt: request.createdAt,
            denialReason: request.denialReason,
            reviewedAt: request.reviewedAt,
          });
        }
      } catch (err) {
        console.error('Error fetching organizer request:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [currentUser]);

  // Check if agreement is current
  const agreementIsCurrent = isAgreementCurrent(userProfile?.organizerAgreement);
  const needsAgreementUpdate = isOrganizer && !agreementIsCurrent;

  // Handle agreement acceptance (for new applicants)
  const handleAgreementAccept = (agreement: OrganizerAgreement) => {
    setPendingAgreement(agreement);
    setShowAgreementModal(false);
    setShowRequestForm(true);
  };

  // Handle agreement update (for existing organizers)
  const handleAgreementUpdate = async (agreement: OrganizerAgreement) => {
    if (!currentUser) return;

    setUpdating(true);
    setError(null);

    try {
      await updateOrganizerAgreement(currentUser.uid, agreement);
      setShowAgreementModal(false);
      // Refresh user profile to get updated agreement
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
    } catch (err: any) {
      console.error('Error updating agreement:', err);
      setError(err.message || 'Failed to update agreement');
    } finally {
      setUpdating(false);
    }
  };

  // Handle request submission success
  const handleRequestSubmitted = () => {
    setShowRequestForm(false);
    setPendingAgreement(null);
    // Reload to show pending status
    setExistingRequest({
      id: currentUser?.uid || '',
      status: 'pending',
      createdAt: Date.now(),
    });
  };

  // Handle reapply after denial
  const handleReapply = () => {
    setExistingRequest(null);
    setShowAgreementModal(true);
  };

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-700 rounded-full"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  // State 4: Is organizer with current agreement - Show verified badge
  if (isOrganizer && agreementIsCurrent) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-lime-600/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-lime-600/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">Verified Organiser</h3>
              <span className="px-2 py-0.5 bg-lime-600/20 text-lime-400 text-xs rounded-full">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Agreement {userProfile?.organizerAgreement?.version} accepted on{' '}
              {new Date(userProfile?.organizerAgreement?.acceptedAt || 0).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // State 5: Is organizer but needs agreement update
  if (needsAgreementUpdate) {
    return (
      <>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-amber-600/30">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-600/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Agreement Update Required</h3>
              <p className="text-sm text-gray-400 mt-1 mb-4">
                Our organiser agreement has been updated to version {CURRENT_ORGANIZER_AGREEMENT_VERSION}.
                Please review and accept the new terms to continue using organiser features.
              </p>
              {error && (
                <p className="text-sm text-red-400 mb-3">{error}</p>
              )}
              <button
                onClick={() => setShowAgreementModal(true)}
                disabled={updating}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Review & Accept Agreement'}
              </button>
            </div>
          </div>
        </div>

        <OrganizerAgreementModal
          isOpen={showAgreementModal}
          onClose={() => setShowAgreementModal(false)}
          onAccept={handleAgreementUpdate}
          mode="existing"
        />
      </>
    );
  }

  // State 2: Pending request
  if (existingRequest?.status === 'pending') {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-600/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">Organiser Request Pending</h3>
              <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded-full">
                Under Review
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Submitted on {new Date(existingRequest.createdAt).toLocaleDateString()}.
              We'll notify you once your request has been reviewed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Rejected request
  if (existingRequest?.status === 'denied') {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-red-600/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">Organiser Request Denied</h3>
              <span className="px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded-full">
                Denied
              </span>
            </div>
            {existingRequest.denialReason && (
              <p className="text-sm text-gray-300 mt-2 p-3 bg-gray-800 rounded-lg">
                <span className="text-gray-500">Reason:</span> {existingRequest.denialReason}
              </p>
            )}
            <p className="text-sm text-gray-400 mt-2">
              Reviewed on {existingRequest.reviewedAt ? new Date(existingRequest.reviewedAt).toLocaleDateString() : 'N/A'}.
              You may submit a new request if circumstances have changed.
            </p>
            <button
              onClick={handleReapply}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Submit New Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  // State 1: Not an organizer, no pending request - Show apply button
  return (
    <>
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-600/20 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">Become an Organiser</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              Organisers can create tournaments, leagues, and events. They're responsible for
              finalising match results and ensuring fair play. This is a trusted role with
              DUPR submission capabilities.
            </p>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <svg className="w-4 h-4 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Create events
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <svg className="w-4 h-4 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Manage matches
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <svg className="w-4 h-4 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Submit to DUPR
              </div>
            </div>
            <button
              onClick={() => setShowAgreementModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
            >
              Apply to Become an Organiser
            </button>
          </div>
        </div>
      </div>

      <OrganizerAgreementModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        onAccept={handleAgreementAccept}
        mode="request"
      />

      {pendingAgreement && (
        <OrganizerRequestForm
          isOpen={showRequestForm}
          onClose={() => {
            setShowRequestForm(false);
            setPendingAgreement(null);
          }}
          onSubmitted={handleRequestSubmitted}
          agreement={pendingAgreement}
        />
      )}
    </>
  );
};

export default BecomeOrganizerSection;
