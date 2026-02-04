/**
 * Resolve Dispute Modal V05.44
 *
 * Modal for organizers to resolve disputed match scores.
 * Options: Finalize as-is, Edit scores, or Void match.
 * Works for ALL league formats.
 *
 * FILE LOCATION: components/leagues/verification/ResolveDisputeModal.tsx
 * VERSION: V05.44
 */

import React, { useState } from 'react';
import { ModalShell } from '../../shared/ModalShell';
import type { DisputeReason } from '../../../types';
import type { VerifiableEventType } from '../../../services/firebase/scoreVerification';
import { resolveDispute } from '../../../services/firebase';

interface ResolveDisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventType: VerifiableEventType;
  eventId: string;
  matchId: string;
  organizerId: string;
  matchDescription?: string;
  team1Score?: number | null;
  team2Score?: number | null;
  team1Name?: string;
  team2Name?: string;
  disputeReason?: DisputeReason;
  disputeNotes?: string;
  disputedByName?: string;
  onResolved?: () => void;
}

type ResolutionAction = 'finalize' | 'edit' | 'void';

/**
 * Resolution action options
 */
const RESOLUTION_ACTIONS: { value: ResolutionAction; label: string; description: string; icon: string }[] = [
  {
    value: 'finalize',
    label: 'Accept Current Score',
    description: 'Finalize the match with the current score',
    icon: '✓',
  },
  {
    value: 'edit',
    label: 'Edit Score',
    description: 'Correct the score and finalize',
    icon: '✏️',
  },
  {
    value: 'void',
    label: 'Void Match',
    description: 'Cancel this match - can be replayed',
    icon: '🗑️',
  },
];

/**
 * Dispute reason labels
 */
const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  wrong_score: 'Wrong Score',
  wrong_winner: 'Wrong Winner',
  other: 'Other Issue',
};

export const ResolveDisputeModal: React.FC<ResolveDisputeModalProps> = ({
  isOpen,
  onClose,
  eventType,
  eventId,
  matchId,
  organizerId,
  matchDescription,
  team1Score,
  team2Score,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  disputeReason,
  disputeNotes,
  disputedByName,
  onResolved,
}) => {
  const [action, setAction] = useState<ResolutionAction | null>(null);
  const [newTeam1Score, setNewTeam1Score] = useState<string>(
    team1Score?.toString() || ''
  );
  const [newTeam2Score, setNewTeam2Score] = useState<string>(
    team2Score?.toString() || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!action) {
      setError('Please select a resolution action');
      return;
    }

    // Validate scores if editing
    if (action === 'edit') {
      const score1 = parseInt(newTeam1Score);
      const score2 = parseInt(newTeam2Score);

      if (isNaN(score1) || isNaN(score2)) {
        setError('Please enter valid scores');
        return;
      }

      if (score1 < 0 || score2 < 0) {
        setError('Scores cannot be negative');
        return;
      }

      if (score1 === score2) {
        setError('Scores cannot be tied');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const newScores = action === 'edit'
        ? {
            team1Score: parseInt(newTeam1Score),
            team2Score: parseInt(newTeam2Score),
          }
        : undefined;

      const result = await resolveDispute(
        eventType,
        eventId,
        matchId,
        organizerId,
        action,
        newScores
      );

      if (result.success) {
        onResolved?.();
        onClose();
      } else {
        setError(result.error || result.message || 'Failed to resolve dispute');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setAction(null);
    setError(null);
    onClose();
  };

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} maxWidth="max-w-lg" className="p-6 max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-red-400">⚠️</span>
            Resolve Disputed Match
          </h3>
          {matchDescription && (
            <p className="text-sm text-gray-400 mt-1">{matchDescription}</p>
          )}
        </div>

        {/* Dispute Details */}
        <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-red-300 mb-2">Dispute Details</h4>
          <div className="space-y-1 text-sm">
            {disputedByName && (
              <div>
                <span className="text-gray-400">Disputed by:</span>{' '}
                <span className="text-white">{disputedByName}</span>
              </div>
            )}
            {disputeReason && (
              <div>
                <span className="text-gray-400">Reason:</span>{' '}
                <span className="text-white">{DISPUTE_REASON_LABELS[disputeReason]}</span>
              </div>
            )}
            {disputeNotes && (
              <div>
                <span className="text-gray-400">Notes:</span>{' '}
                <span className="text-white">{disputeNotes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Current Score */}
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Current Score</h4>
          <div className="flex items-center justify-center gap-4 text-xl">
            <div className="text-center">
              <div className="text-gray-400 text-sm">{team1Name}</div>
              <div className="text-white font-bold">{team1Score ?? '-'}</div>
            </div>
            <div className="text-gray-500">vs</div>
            <div className="text-center">
              <div className="text-gray-400 text-sm">{team2Name}</div>
              <div className="text-white font-bold">{team2Score ?? '-'}</div>
            </div>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Resolution Action *
          </label>
          <div className="space-y-2">
            {RESOLUTION_ACTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  action === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="resolutionAction"
                  value={option.value}
                  checked={action === option.value}
                  onChange={() => setAction(option.value)}
                  className="mt-1"
                />
                <div>
                  <div className="text-white font-medium flex items-center gap-2">
                    <span>{option.icon}</span>
                    {option.label}
                  </div>
                  <div className="text-sm text-gray-400">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Edit Score Fields (only shown when "edit" is selected) */}
        {action === 'edit' && (
          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Correct Score</h4>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <label className="block text-xs text-gray-400 mb-1">
                  {team1Name}
                </label>
                <input
                  type="number"
                  min="0"
                  value={newTeam1Score}
                  onChange={(e) => setNewTeam1Score(e.target.value)}
                  className="w-20 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-center text-xl font-bold focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="text-gray-500 text-xl">-</div>
              <div className="text-center">
                <label className="block text-xs text-gray-400 mb-1">
                  {team2Name}
                </label>
                <input
                  type="number"
                  min="0"
                  value={newTeam2Score}
                  onChange={(e) => setNewTeam2Score(e.target.value)}
                  className="w-20 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-center text-xl font-bold focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Warning for void action */}
        {action === 'void' && (
          <div className="bg-orange-900/20 border border-orange-600/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-orange-300">
              Voiding the match will reset it to scheduled status.
              Players will need to replay the match.
            </p>
          </div>
        )}

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
            disabled={submitting || !action}
            className={`flex-1 py-2 text-white rounded-lg font-semibold transition-colors ${
              action === 'void'
                ? 'bg-red-600 hover:bg-red-500 disabled:bg-gray-600'
                : 'bg-primary hover:bg-primary/80 disabled:bg-gray-600'
            }`}
          >
            {submitting ? 'Resolving...' : 'Resolve Dispute'}
          </button>
        </div>
    </ModalShell>
  );
};

export default ResolveDisputeModal;
