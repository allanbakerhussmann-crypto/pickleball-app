/**
 * Score Verification Badge V05.44
 *
 * Displays the verification status of a match score.
 * Works for ALL league formats (box league, ladder, swiss, round robin).
 *
 * FILE LOCATION: components/leagues/verification/ScoreVerificationBadge.tsx
 * VERSION: V05.44
 */

import React from 'react';
import type { MatchVerificationStatus } from '../../../types';

interface ScoreVerificationBadgeProps {
  status: MatchVerificationStatus;
  confirmationCount?: number;
  requiredConfirmations?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

/**
 * Badge colors and labels for each verification status
 */
const STATUS_CONFIG: Record<
  MatchVerificationStatus,
  { bg: string; text: string; label: string; icon: string }
> = {
  pending: {
    bg: 'bg-yellow-900/30',
    text: 'text-yellow-400',
    label: 'Awaiting Confirmation',
    icon: '⏳',
  },
  confirmed: {
    bg: 'bg-blue-900/30',
    text: 'text-blue-400',
    label: 'Processing',
    icon: '🔄',
  },
  disputed: {
    bg: 'bg-red-900/30',
    text: 'text-red-400',
    label: 'Disputed',
    icon: '⚠️',
  },
  final: {
    bg: 'bg-green-900/30',
    text: 'text-green-400',
    label: 'Final',
    icon: '✓',
  },
};

/**
 * Size classes for badge
 */
const SIZE_CLASSES = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export const ScoreVerificationBadge: React.FC<ScoreVerificationBadgeProps> = ({
  status,
  confirmationCount,
  requiredConfirmations,
  size = 'sm',
  showCount = false,
}) => {
  const config = STATUS_CONFIG[status];
  const sizeClass = SIZE_CLASSES[size];

  // Build label with confirmation count if needed
  let displayLabel = config.label;
  if (showCount && status !== 'final' && status !== 'disputed') {
    if (confirmationCount !== undefined && requiredConfirmations !== undefined) {
      displayLabel = `${confirmationCount}/${requiredConfirmations} confirmed`;
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bg} ${config.text} ${sizeClass}`}
    >
      <span>{config.icon}</span>
      <span>{displayLabel}</span>
    </span>
  );
};

/**
 * Compact version - just the icon and status text
 */
export const ScoreVerificationIcon: React.FC<{
  status: MatchVerificationStatus;
  size?: 'sm' | 'md' | 'lg';
}> = ({ status, size = 'sm' }) => {
  const config = STATUS_CONFIG[status];
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <span className={`${config.text} ${sizeClasses[size]}`} title={config.label}>
      {config.icon}
    </span>
  );
};

export default ScoreVerificationBadge;
