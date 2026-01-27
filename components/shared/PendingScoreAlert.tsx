/**
 * PendingScoreAlert Component
 *
 * Global alert banner shown when a user has a match score awaiting their acknowledgement.
 * Appears at the top of the page above the header.
 *
 * @version V07.53
 * @file components/shared/PendingScoreAlert.tsx
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingScoreAcknowledgements } from '../../hooks/usePendingScoreAcknowledgements';
import { getRoute } from '../../router/routes';

export const PendingScoreAlert: React.FC = () => {
  const navigate = useNavigate();
  const { pendingMatches, loading } = usePendingScoreAcknowledgements();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Filter out dismissed matches
  const visibleMatches = pendingMatches.filter(m => !dismissedIds.has(m.matchId));

  // Don't render if loading or no pending matches
  if (loading || visibleMatches.length === 0) {
    return null;
  }

  // Show the first pending match (most recent)
  const match = visibleMatches[0];
  const remainingCount = visibleMatches.length - 1;

  const handleView = () => {
    // Navigate to the event page
    if (match.eventType === 'tournament') {
      navigate(getRoute.tournamentDetail(match.eventId));
    } else if (match.eventType === 'league') {
      navigate(getRoute.leagueDetail(match.eventId));
    } else if (match.eventType === 'meetup') {
      navigate(getRoute.meetupDetail(match.eventId));
    }
  };

  const handleDismiss = () => {
    setDismissedIds(prev => new Set([...prev, match.matchId]));
  };

  return (
    <div className="bg-amber-500 text-gray-900 px-4 py-2 relative z-50">
      <div className="container mx-auto flex items-center justify-between gap-3">
        {/* Bell icon and message */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span className="text-sm font-medium truncate">
            Score awaiting your acknowledgement: <strong>{match.proposedBy}</strong> proposed <strong>{match.proposedScore}</strong>
            {remainingCount > 0 && (
              <span className="ml-1 text-amber-800">
                (+{remainingCount} more)
              </span>
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleView}
            className="px-3 py-1 text-sm font-semibold bg-gray-900 text-amber-500 rounded hover:bg-gray-800 transition-colors"
          >
            View
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-amber-600 rounded transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingScoreAlert;
