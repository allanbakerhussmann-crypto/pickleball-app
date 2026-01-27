/**
 * ScoreHeader Component
 *
 * Header for score entry modal with dynamic title and verification badge.
 *
 * @version V07.53
 * @file components/shared/scoring/ScoreHeader.tsx
 */

import React from 'react';
import type { EventScoringStateResult } from '../../../hooks/useEventScoringState';

interface ScoreHeaderProps {
  /** Scoring state from useEventScoringState */
  state: EventScoringStateResult;
  /** Handler for close button */
  onClose: () => void;
  /** Legacy verification data for badge */
  legacyVerification?: {
    confirmations?: string[];
    requiredConfirmations?: number;
  };
}

/**
 * Badge colors and labels for each verification status
 */
const STATUS_CONFIG: Record<
  'pending' | 'confirmed' | 'disputed' | 'final',
  { bg: string; text: string; label: string; icon: string }
> = {
  pending: {
    bg: 'bg-yellow-900/30',
    text: 'text-yellow-400',
    label: 'Awaiting Confirmation',
    icon: '\u23F3', // hourglass
  },
  confirmed: {
    bg: 'bg-blue-900/30',
    text: 'text-blue-400',
    label: 'Processing',
    icon: '\uD83D\uDD04', // arrows
  },
  disputed: {
    bg: 'bg-red-900/30',
    text: 'text-red-400',
    label: 'Disputed',
    icon: '\u26A0\uFE0F', // warning
  },
  final: {
    bg: 'bg-green-900/30',
    text: 'text-green-400',
    label: 'Final',
    icon: '\u2713', // checkmark
  },
};

export const ScoreHeader: React.FC<ScoreHeaderProps> = ({
  state,
  onClose,
  legacyVerification,
}) => {
  const statusConfig = state.verificationStatus
    ? STATUS_CONFIG[state.verificationStatus]
    : null;

  const showCount = state.isPending && !state.isFinal && !state.isDisputed;
  const confirmationCount = legacyVerification?.confirmations?.length || 0;
  const requiredConfirmations = legacyVerification?.requiredConfirmations || 1;

  let displayLabel = statusConfig?.label;
  if (showCount && statusConfig) {
    displayLabel = `${confirmationCount}/${requiredConfirmations} confirmed`;
  }

  return (
    <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            {state.headerTitle}
          </h2>
          {/* Verification Badge */}
          {statusConfig && (
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1 rounded-full font-medium text-xs px-1.5 py-0.5 ${statusConfig.bg} ${statusConfig.text}`}
              >
                <span>{statusConfig.icon}</span>
                <span>{displayLabel}</span>
              </span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ScoreHeader;
