/**
 * OrganizerRequestForm Component V07.05
 *
 * Form for submitting organizer access request after agreement acceptance.
 * Collects reason, experience, and optional club association.
 *
 * FILE LOCATION: components/profile/OrganizerRequestForm.tsx
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createOrganizerRequest } from '../../services/firebase/organizerRequests';
import type { OrganizerAgreement } from '../../types';

interface OrganizerRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  agreement: OrganizerAgreement;
}

export const OrganizerRequestForm: React.FC<OrganizerRequestFormProps> = ({
  isOpen,
  onClose,
  onSubmitted,
  agreement,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [reason, setReason] = useState('');
  const [experience, setExperience] = useState('');
  const [associatedClub, setAssociatedClub] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser || !userProfile) {
      setError('You must be logged in to submit a request');
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for your request');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createOrganizerRequest({
        odUserId: currentUser.uid,
        userEmail: userProfile.email,
        userName: userProfile.displayName,
        userPhotoURL: userProfile.photoURL || userProfile.photoData,
        reason: reason.trim(),
        experience: experience.trim() || undefined,
        associatedClub: associatedClub.trim() || undefined,
        agreement,
      });

      onSubmitted();
    } catch (err: any) {
      console.error('Error submitting organizer request:', err);
      setError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl max-w-lg w-full border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Complete Your Request</h2>
              <p className="text-sm text-gray-400 mt-1">
                Tell us about yourself and why you want to become an organiser
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Agreement confirmation badge */}
          <div className="flex items-center gap-2 p-3 bg-lime-900/20 border border-lime-600/30 rounded-lg">
            <svg className="w-5 h-5 text-lime-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-lime-400">
              Agreement {agreement.version} accepted
            </span>
          </div>

          {/* Reason - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Why do you want to become an organiser? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe your goals and what events you plan to organize..."
              rows={3}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-lime-500 outline-none resize-none"
              required
            />
          </div>

          {/* Experience - Optional */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Event organizing experience <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Any previous experience running tournaments, leagues, or sports events..."
              rows={2}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-lime-500 outline-none resize-none"
            />
          </div>

          {/* Associated Club - Optional */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Associated club or venue <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={associatedClub}
              onChange={(e) => setAssociatedClub(e.target.value)}
              placeholder="Name of club, venue, or organization you're associated with"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-lime-500 outline-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                submitting || !reason.trim()
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-lime-600 hover:bg-lime-500 text-black'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>

          {/* Note */}
          <p className="text-xs text-gray-500 text-center">
            Your request will be reviewed by an administrator. You'll receive a notification once it's been processed.
          </p>
        </form>
      </div>
    </div>
  );
};

export default OrganizerRequestForm;
