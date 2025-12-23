/**
 * Confirm Score Button V05.44
 *
 * Button that allows eligible players to confirm a match score.
 * Shows confirmation count and handles the confirm action.
 * Works for ALL league formats.
 *
 * FILE LOCATION: components/leagues/verification/ConfirmScoreButton.tsx
 * VERSION: V05.44
 */

import React, { useState } from 'react';
import type {
  MatchVerificationStatus,
  ScoreVerificationSettings,
} from '../../../types';
import type { VerifiableEventType } from '../../../services/firebase/scoreVerification';
import { confirmMatchScore } from '../../../services/firebase';

interface ConfirmScoreButtonProps {
  eventType: VerifiableEventType;
  eventId: string;
  matchId: string;
  userId: string;
  verificationStatus: MatchVerificationStatus;
  confirmationCount: number;
  requiredConfirmations: number;
  settings: ScoreVerificationSettings;
  hasUserConfirmed: boolean;
  canUserConfirm: boolean;
  onConfirmed?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Size classes for button
 */
const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
};

export const ConfirmScoreButton: React.FC<ConfirmScoreButtonProps> = ({
  eventType,
  eventId,
  matchId,
  userId,
  verificationStatus,
  confirmationCount,
  requiredConfirmations,
  settings,
  hasUserConfirmed,
  canUserConfirm,
  onConfirmed,
  size = 'md',
}) => {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't show for finalized or disputed matches
  if (verificationStatus === 'final' || verificationStatus === 'disputed') {
    return null;
  }

  // Don't show if user already confirmed
  if (hasUserConfirmed) {
    return (
      <span className="text-xs text-green-400">
        ✓ You confirmed
      </span>
    );
  }

  // Don't show if user can't confirm (e.g., entered the score themselves)
  if (!canUserConfirm) {
    return (
      <span className="text-xs text-gray-500">
        Waiting for opponent
      </span>
    );
  }

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);

    try {
      const result = await confirmMatchScore(
        eventType,
        eventId,
        matchId,
        userId,
        settings
      );

      if (result.success) {
        onConfirmed?.();
      } else {
        setError(result.error || result.message || 'Failed to confirm');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  };

  const sizeClass = SIZE_CLASSES[size];

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleConfirm}
        disabled={confirming}
        className={`bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors ${sizeClass}`}
      >
        {confirming ? 'Confirming...' : 'Confirm Score'}
      </button>

      {/* Show confirmation progress */}
      <span className="text-xs text-gray-400">
        {confirmationCount}/{requiredConfirmations} confirmed
      </span>

      {/* Show error if any */}
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
};

/**
 * Compact inline version for match cards
 */
export const ConfirmScoreButtonInline: React.FC<ConfirmScoreButtonProps> = (props) => {
  const {
    verificationStatus,
    hasUserConfirmed,
    canUserConfirm,
    confirmationCount,
    requiredConfirmations,
  } = props;

  // Don't show for finalized or disputed matches
  if (verificationStatus === 'final' || verificationStatus === 'disputed') {
    return null;
  }

  // Already confirmed by user
  if (hasUserConfirmed) {
    return <span className="text-green-400 text-xs">✓</span>;
  }

  // Can't confirm
  if (!canUserConfirm) {
    return (
      <span className="text-gray-500 text-xs">
        {confirmationCount}/{requiredConfirmations}
      </span>
    );
  }

  // Show confirm button
  return <ConfirmScoreButton {...props} size="sm" />;
};

export default ConfirmScoreButton;
