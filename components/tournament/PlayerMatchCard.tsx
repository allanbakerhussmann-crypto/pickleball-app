/**
 * PlayerMatchCard Component
 *
 * Shows a player's current/upcoming match with the ability to start the match.
 * Players can only start matches they are participating in.
 *
 * FILE LOCATION: components/tournament/PlayerMatchCard.tsx
 * VERSION: V06.07
 */

import React, { useState } from 'react';
import type { Match } from '../../types';
import { updateMatchScore } from '../../services/firebase';

interface PlayerMatchCardProps {
  match: Match;
  tournamentId: string;
  currentUserId: string;
  onMatchStarted?: () => void;
}

export const PlayerMatchCard: React.FC<PlayerMatchCardProps> = ({
  match,
  tournamentId,
  currentUserId,
  onMatchStarted,
}) => {
  const [isStarting, setIsStarting] = useState(false);

  // Check if current user is a participant in this match
  const isParticipant =
    match.sideA?.playerIds?.includes(currentUserId) ||
    match.sideB?.playerIds?.includes(currentUserId);

  // Determine which side the user is on
  const userSide = match.sideA?.playerIds?.includes(currentUserId)
    ? 'sideA'
    : match.sideB?.playerIds?.includes(currentUserId)
    ? 'sideB'
    : null;

  // Get team names
  const sideAName = match.sideA?.name || 'Team A';
  const sideBName = match.sideB?.name || 'Team B';

  // Determine match status display
  const isOnCourt = !!match.court;
  const isWaitingToStart = isOnCourt && match.status === 'scheduled';
  const isInProgress = match.status === 'in_progress';
  const isCompleted = match.status === 'completed';

  // Handle starting the match
  const handleStartMatch = async () => {
    if (!isParticipant || !isWaitingToStart) return;

    setIsStarting(true);
    try {
      await updateMatchScore(tournamentId, match.id, {
        status: 'in_progress',
        startTime: Date.now(),
      });
      onMatchStarted?.();
    } catch (error) {
      console.error('Failed to start match:', error);
      alert('Failed to start match. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  // Status badge
  const renderStatusBadge = () => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold';

    if (isCompleted) {
      return <span className={`${base} bg-gray-600 text-white`}>Completed</span>;
    }
    if (isInProgress) {
      return <span className={`${base} bg-emerald-500 text-gray-900`}>In Progress</span>;
    }
    if (isWaitingToStart) {
      return <span className={`${base} bg-blue-500 text-white`}>Ready to Start</span>;
    }
    if (isOnCourt) {
      return <span className={`${base} bg-amber-500 text-gray-900`}>Assigned</span>;
    }
    return <span className={`${base} bg-gray-700 text-gray-300`}>Waiting</span>;
  };

  if (!isParticipant) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Your Match</h3>
          {match.poolGroup && (
            <span className="text-xs text-gray-400">{match.poolGroup}</span>
          )}
        </div>
        {renderStatusBadge()}
      </div>

      {/* Match Info */}
      <div className="space-y-2 mb-4">
        <div
          className={`flex items-center justify-between p-2 rounded ${
            userSide === 'sideA' ? 'bg-lime-900/30 border border-lime-600' : 'bg-gray-900'
          }`}
        >
          <span className="text-white font-medium">{sideAName}</span>
          {userSide === 'sideA' && (
            <span className="text-xs text-lime-400 font-semibold">YOU</span>
          )}
        </div>

        <div className="text-center text-gray-500 text-xs">vs</div>

        <div
          className={`flex items-center justify-between p-2 rounded ${
            userSide === 'sideB' ? 'bg-lime-900/30 border border-lime-600' : 'bg-gray-900'
          }`}
        >
          <span className="text-white font-medium">{sideBName}</span>
          {userSide === 'sideB' && (
            <span className="text-xs text-lime-400 font-semibold">YOU</span>
          )}
        </div>
      </div>

      {/* Court Assignment */}
      {isOnCourt && (
        <div className="mb-4 p-3 bg-gray-900 rounded border border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-white font-semibold">{match.court}</span>
          </div>
          {isWaitingToStart && (
            <p className="text-sm text-gray-400 mt-1">
              Head to your court and tap Start when both teams are ready.
            </p>
          )}
        </div>
      )}

      {/* Score Display (if in progress or completed) */}
      {(isInProgress || isCompleted) && match.scores && match.scores.length > 0 && (
        <div className="mb-4 p-3 bg-gray-900 rounded">
          <div className="text-sm text-gray-400 mb-1">Score</div>
          <div className="flex items-center justify-center gap-4 text-2xl font-bold">
            <span className={userSide === 'sideA' ? 'text-lime-400' : 'text-white'}>
              {match.scores[0]?.scoreA ?? 0}
            </span>
            <span className="text-gray-500">-</span>
            <span className={userSide === 'sideB' ? 'text-lime-400' : 'text-white'}>
              {match.scores[0]?.scoreB ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {isWaitingToStart && (
          <button
            onClick={handleStartMatch}
            disabled={isStarting}
            className="flex-1 py-3 px-4 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Starting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Match
              </>
            )}
          </button>
        )}

        {isInProgress && (
          <div className="flex-1 py-3 px-4 bg-emerald-900/50 border border-emerald-600 text-emerald-400 font-semibold rounded-lg text-center">
            Match in Progress
          </div>
        )}

        {!isOnCourt && !isCompleted && (
          <div className="flex-1 py-3 px-4 bg-gray-700 text-gray-400 rounded-lg text-center">
            Waiting for court assignment...
          </div>
        )}
      </div>
    </div>
  );
};
