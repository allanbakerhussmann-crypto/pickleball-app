/**
 * UpcomingMatchCard - Shows a single upcoming match for the player
 *
 * Displays match participants and allows navigation to match detail/score entry.
 *
 * V07.49: Initial implementation
 *
 * FILE LOCATION: components/myevents/UpcomingMatchCard.tsx
 * VERSION: V07.49
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getRoute } from '../../router/routes';
import { formatTime } from '../../utils/timeFormat';
import type { Match } from '../../types';

interface UpcomingMatchCardProps {
  match: Match;
  leagueId: string;
  currentUserId: string;
}

export const UpcomingMatchCard: React.FC<UpcomingMatchCardProps> = ({
  match,
  leagueId,
  currentUserId,
}) => {
  const navigate = useNavigate();

  // Determine which side the user is on
  const userSide = match.sideA?.playerIds?.includes(currentUserId) ? 'A' :
                   match.sideB?.playerIds?.includes(currentUserId) ? 'B' : null;

  // Get partner name (other player on user's side)
  const getPartnerName = () => {
    if (!userSide) return null;
    const side = userSide === 'A' ? match.sideA : match.sideB;
    const partnerIndex = side?.playerIds?.findIndex(id => id !== currentUserId);
    if (partnerIndex === undefined || partnerIndex === -1) return null;

    // Try to get name from playerNames array or fall back to side name
    const names = side?.name?.split(' + ') || [];
    return names.length > 1 ? names[partnerIndex] : side?.name;
  };

  // Get opponent names
  const opponentSide = userSide === 'A' ? match.sideB : match.sideA;
  const opponentName = opponentSide?.name || 'Opponent';

  // Format the match status
  const getStatusInfo = () => {
    switch (match.status) {
      case 'scheduled':
        return { label: 'Scheduled', className: 'bg-gray-600/50 text-gray-300' };
      case 'in_progress':
        return { label: 'In Progress', className: 'bg-lime-500/20 text-lime-400' };
      case 'completed':
        return { label: 'Completed', className: 'bg-blue-500/20 text-blue-400' };
      case 'pending_confirmation':
        return { label: 'Verify Score', className: 'bg-yellow-500/20 text-yellow-400' };
      case 'disputed':
        return { label: 'Disputed', className: 'bg-red-500/20 text-red-400' };
      default:
        return null;
    }
  };

  const statusInfo = getStatusInfo();
  const partnerName = getPartnerName();

  // Handle click to navigate to match detail
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling to parent card
    navigate(getRoute.leagueMatch(leagueId, match.id));
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left bg-gray-800/50 hover:bg-gray-800 rounded-lg p-3 transition-colors border border-gray-700/30 hover:border-gray-600/50"
    >
      <div className="flex items-center justify-between gap-2">
        {/* Match Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-300 font-medium">You</span>
            {partnerName && (
              <>
                <span className="text-gray-500">+</span>
                <span className="text-gray-400 truncate">{partnerName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm mt-0.5">
            <span className="text-gray-500">vs</span>
            <span className="text-gray-400 truncate">{opponentName}</span>
          </div>
        </div>

        {/* Court, Time & Status - V07.50 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {match.court && (
            <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">
              {match.court}
            </span>
          )}
          {match.scheduledTime && (
            <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
              {formatTime(match.scheduledTime)}
            </span>
          )}
          {statusInfo && (
            <span className={`px-2 py-0.5 rounded text-xs ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          )}
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Venue - V07.50 */}
      {match.venue && (
        <div className="mt-1 text-xs text-gray-500 truncate">
          📍 {match.venue}
        </div>
      )}

      {/* Score (if completed) */}
      {match.status === 'completed' && match.scores && match.scores.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700/30">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Score:</span>
            <span className={`font-medium ${match.winnerId === (userSide === 'A' ? match.sideA?.id : match.sideB?.id) ? 'text-lime-400' : 'text-gray-400'}`}>
              {match.scores.map(s => `${s.scoreA}-${s.scoreB}`).join(', ')}
            </span>
            {match.winnerId === (userSide === 'A' ? match.sideA?.id : match.sideB?.id) && (
              <span className="text-lime-500">W</span>
            )}
          </div>
        </div>
      )}
    </button>
  );
};

export default UpcomingMatchCard;
