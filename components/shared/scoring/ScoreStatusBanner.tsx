/**
 * ScoreStatusBanner Component
 *
 * Displays status messages and warnings in the score entry modal footer.
 *
 * @version V07.53
 * @file components/shared/scoring/ScoreStatusBanner.tsx
 */

import React from 'react';
import type { EventScoringStateResult } from '../../../hooks/useEventScoringState';

interface ScoreStatusBannerProps {
  /** Scoring state from useEventScoringState */
  state: EventScoringStateResult;
}

/**
 * Banner styling based on message type
 */
const TYPE_STYLES: Record<'warning' | 'info' | 'success' | 'error', string> = {
  warning: 'bg-amber-900/30 border-amber-600/50 text-amber-200',
  info: 'bg-blue-900/30 border-blue-600/50 text-blue-200',
  success: 'bg-green-900/30 border-green-600/50 text-green-200',
  error: 'bg-red-900/30 border-red-600/50 text-red-200',
};

const TYPE_ICONS: Record<'warning' | 'info' | 'success' | 'error', string> = {
  warning: '\u26A0\uFE0F', // warning sign
  info: '\u2139\uFE0F',    // info
  success: '\u2713',       // checkmark
  error: '\u274C',         // cross
};

export const ScoreStatusBanner: React.FC<ScoreStatusBannerProps> = ({
  state,
}) => {
  if (!state.statusMessage || !state.statusMessageType) {
    return null;
  }

  const styles = TYPE_STYLES[state.statusMessageType];
  const icon = TYPE_ICONS[state.statusMessageType];

  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${styles}`}>
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0">{icon}</span>
        <span>{state.statusMessage}</span>
      </div>
    </div>
  );
};

/**
 * Footer status message (simpler inline version)
 */
export const ScoreStatusFooter: React.FC<ScoreStatusBannerProps> = ({
  state,
}) => {
  if (!state.statusMessage || !state.statusMessageType) {
    return null;
  }

  const colorMap: Record<'warning' | 'info' | 'success' | 'error', string> = {
    warning: 'text-yellow-400',
    info: 'text-blue-400',
    success: 'text-purple-400',
    error: 'text-red-400',
  };

  const iconMap: Record<'warning' | 'info' | 'success' | 'error', string> = {
    warning: '\u23F3', // hourglass
    info: '',
    success: '\u2713', // checkmark
    error: '\u26A0\uFE0F', // warning
  };

  return (
    <div className={`text-sm text-center mb-3 ${colorMap[state.statusMessageType]}`}>
      {iconMap[state.statusMessageType]} {state.statusMessage}
    </div>
  );
};

export default ScoreStatusBanner;
