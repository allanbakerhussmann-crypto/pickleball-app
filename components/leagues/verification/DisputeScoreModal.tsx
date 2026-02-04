/**
 * Dispute Score Modal V05.44
 *
 * Modal for players to dispute a match score.
 * Collects reason and optional notes.
 * Works for ALL league formats.
 *
 * FILE LOCATION: components/leagues/verification/DisputeScoreModal.tsx
 * VERSION: V05.44
 */

import React, { useState } from 'react';
import { ModalShell } from '../../shared/ModalShell';
import type { DisputeReason } from '../../../types';
import type { VerifiableEventType } from '../../../services/firebase/scoreVerification';
import { disputeMatchScore } from '../../../services/firebase';

interface DisputeScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventType: VerifiableEventType;
  eventId: string;
  matchId: string;
  userId: string;
  matchDescription?: string; // e.g., "Player A vs Player B"
  currentScore?: string;     // e.g., "11-7"
  onDisputed?: () => void;
}

/**
 * Dispute reason options with labels
 */
const DISPUTE_REASONS: { value: DisputeReason; label: string; description: string }[] = [
  {
    value: 'wrong_score',
    label: 'Wrong Score',
    description: 'The score entered is incorrect',
  },
  {
    value: 'wrong_winner',
    label: 'Wrong Winner',
    description: 'The winning team/player is incorrect',
  },
  {
    value: 'other',
    label: 'Other Issue',
    description: 'Another issue with this match',
  },
];

export const DisputeScoreModal: React.FC<DisputeScoreModalProps> = ({
  isOpen,
  onClose,
  eventType,
  eventId,
  matchId,
  userId,
  matchDescription,
  currentScore,
  onDisputed,
}) => {
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please select a reason');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await disputeMatchScore(
        eventType,
        eventId,
        matchId,
        userId,
        reason,
        notes || undefined
      );

      if (result.success) {
        onDisputed?.();
        onClose();
      } else {
        setError(result.error || result.message || 'Failed to submit dispute');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason(null);
    setNotes('');
    setError(null);
    onClose();
  };

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} className="p-6">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-yellow-400">⚠️</span>
            Dispute Score
          </h3>
          {matchDescription && (
            <p className="text-sm text-gray-400 mt-1">{matchDescription}</p>
          )}
          {currentScore && (
            <p className="text-sm text-gray-500 mt-1">
              Current score: <span className="text-white">{currentScore}</span>
            </p>
          )}
        </div>

        {/* Warning */}
        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 mb-4">
          <p className="text-sm text-yellow-300">
            Disputing will flag this match for organizer review.
            The match will be excluded from standings until resolved.
          </p>
        </div>

        {/* Reason Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Reason for Dispute *
          </label>
          <div className="space-y-2">
            {DISPUTE_REASONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  reason === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="disputeReason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="mt-1"
                />
                <div>
                  <div className="text-white font-medium">{option.label}</div>
                  <div className="text-sm text-gray-400">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Additional Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Provide any additional details..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary"
            rows={3}
            maxLength={500}
          />
          <div className="text-right text-xs text-gray-500 mt-1">
            {notes.length}/500
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason}
            className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Dispute'}
          </button>
        </div>
    </ModalShell>
  );
};

export default DisputeScoreModal;
