/**
 * TeamLeagueFixtureCard Component
 *
 * Displays a single fixture (team vs team match) with board results.
 * Shows status, teams, scores, and action buttons.
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueFixtureCard.tsx
 * VERSION: V07.53
 */

import React, { useState } from 'react';
import { formatTime } from '../../utils/timeFormat';
import type {
  TeamLeagueFixture,
  InterclubTeam,
  TeamLeagueSettings,
  FixtureBoardMatch,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeagueFixtureCardProps {
  fixture: TeamLeagueFixture;
  teams: InterclubTeam[];
  settings: TeamLeagueSettings;
  isOrganizer: boolean;
  isMyTeam: boolean;
  onViewDetails?: (fixture: TeamLeagueFixture) => void;
  onEnterScore?: (fixture: TeamLeagueFixture) => void;
  onSubmitLineup?: (fixture: TeamLeagueFixture, teamId: string) => void;
}

// ============================================
// HELPERS
// ============================================

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const getStatusBadge = (status: TeamLeagueFixture['status']) => {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', color: 'bg-gray-600 text-gray-200' };
    case 'lineups_submitted':
      return { label: 'Lineups Ready', color: 'bg-blue-600/80 text-blue-100' };
    case 'in_progress':
      return { label: 'In Progress', color: 'bg-amber-600/80 text-amber-100' };
    case 'completed':
      return { label: 'Completed', color: 'bg-lime-600/80 text-lime-100' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'bg-red-600/80 text-red-100' };
    default:
      return { label: status, color: 'bg-gray-600 text-gray-200' };
  }
};

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueFixtureCard: React.FC<TeamLeagueFixtureCardProps> = ({
  fixture,
  teams,
  settings: _settings,
  isOrganizer,
  isMyTeam,
  onViewDetails,
  onEnterScore,
  onSubmitLineup,
}) => {
  const [expanded, setExpanded] = useState(false);

  const homeTeam = teams.find(t => t.id === fixture.homeTeamId);
  const awayTeam = teams.find(t => t.id === fixture.awayTeamId);
  const isBye = fixture.awayTeamId === 'BYE';
  const statusBadge = getStatusBadge(fixture.status);

  // Determine if lineups can be submitted
  const canSubmitLineup = (teamId: string) => {
    if (fixture.status !== 'scheduled') return false;
    if (teamId === fixture.homeTeamId && fixture.homeLineup) return false;
    if (teamId === fixture.awayTeamId && fixture.awayLineup) return false;
    return true;
  };

  // Calculate board scores summary
  const getBoardsSummary = () => {
    if (fixture.status !== 'completed' && fixture.status !== 'in_progress') {
      return null;
    }

    const boardsArray = Object.values(fixture.boards || {});
    const homeWins = boardsArray.filter(b => b.winningSide === 'home').length;
    const awayWins = boardsArray.filter(b => b.winningSide === 'away').length;
    const played = boardsArray.filter(b => b.status === 'played').length;
    const total = boardsArray.length;

    return { homeWins, awayWins, played, total };
  };

  const boardsSummary = getBoardsSummary();

  // Render board result row
  const renderBoardResult = (board: FixtureBoardMatch) => {
    const isPlayed = board.status === 'played';

    return (
      <div
        key={board.boardMatchId}
        className={`
          flex items-center justify-between py-2 px-3 rounded-lg
          ${isPlayed ? 'bg-gray-700/30' : 'bg-gray-800/30'}
        `}
      >
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-300">Board {board.boardNumber}</div>
          {isPlayed && (
            <div className="text-xs text-gray-500 mt-0.5">
              {(board.homePlayerNames || []).join(' & ')} vs{' '}
              {(board.awayPlayerNames || []).join(' & ')}
            </div>
          )}
        </div>

        {isPlayed ? (
          <div className="flex items-center gap-3">
            {/* Game scores */}
            <div className="flex gap-1">
              {(board.scores || []).map((game, idx) => (
                <span
                  key={idx}
                  className={`
                    px-2 py-0.5 rounded text-xs font-mono
                    ${game.scoreA > game.scoreB
                      ? 'bg-lime-600/30 text-lime-300'
                      : 'bg-red-600/30 text-red-300'
                    }
                  `}
                >
                  {game.scoreA}-{game.scoreB}
                </span>
              ))}
            </div>

            {/* Winner indicator */}
            <div className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${board.winningSide === 'home' ? 'bg-lime-600 text-white' : 'bg-gray-600 text-gray-300'}
            `}>
              {board.winningSide === 'home' ? 'H' : 'A'}
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-500 uppercase">{board.status}</span>
        )}
      </div>
    );
  };

  return (
    <div className={`
      bg-gray-800/50 rounded-xl border border-gray-700/50
      transition-all duration-200
      ${isMyTeam ? 'ring-1 ring-lime-500/30' : ''}
    `}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          {/* Week and date */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
              Week {fixture.weekNumber}
            </span>
            <span className="text-sm text-gray-400">
              {formatDate(fixture.scheduledDate)}
            </span>
            {fixture.scheduledTime && (
              <span className="text-sm text-gray-500">
                {formatTime(fixture.scheduledTime)}
              </span>
            )}
          </div>

          {/* Status badge */}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Teams and score */}
        <div className="flex items-center justify-between">
          {/* Home team */}
          <div className="flex-1">
            <div className={`text-lg font-semibold ${
              fixture.result?.winnerId === 'home' ? 'text-lime-400' : 'text-white'
            }`}>
              {fixture.homeTeamName}
              {fixture.result?.winnerId === 'home' && (
                <span className="ml-2 text-lime-400">✓</span>
              )}
            </div>
            {homeTeam?.clubName && (
              <div className="text-xs text-gray-500">{homeTeam.clubName}</div>
            )}
          </div>

          {/* Score or VS */}
          <div className="px-4">
            {boardsSummary ? (
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${
                  boardsSummary.homeWins > boardsSummary.awayWins ? 'text-lime-400' : 'text-white'
                }`}>
                  {boardsSummary.homeWins}
                </span>
                <span className="text-gray-500">-</span>
                <span className={`text-2xl font-bold ${
                  boardsSummary.awayWins > boardsSummary.homeWins ? 'text-lime-400' : 'text-white'
                }`}>
                  {boardsSummary.awayWins}
                </span>
              </div>
            ) : (
              <span className="text-gray-500 text-sm font-medium">vs</span>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 text-right">
            {isBye ? (
              <div className="text-lg font-semibold text-gray-500 italic">BYE</div>
            ) : (
              <>
                <div className={`text-lg font-semibold ${
                  fixture.result?.winnerId === 'away' ? 'text-lime-400' : 'text-white'
                }`}>
                  {fixture.awayTeamName}
                  {fixture.result?.winnerId === 'away' && (
                    <span className="ml-2 text-lime-400">✓</span>
                  )}
                </div>
                {awayTeam?.clubName && (
                  <div className="text-xs text-gray-500">{awayTeam.clubName}</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Venue */}
        {fixture.venueName && (
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {fixture.venueName}
          </div>
        )}
      </div>

      {/* Expand/collapse for board details */}
      {Object.keys(fixture.boards || {}).length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 flex items-center justify-between text-gray-400 hover:text-white transition-colors"
        >
          <span className="text-sm">
            {expanded ? 'Hide' : 'Show'} Board Details ({Object.keys(fixture.boards || {}).length} boards)
          </span>
          <svg
            className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Expanded board details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {Object.values(fixture.boards || {})
            .sort((a, b) => a.boardNumber - b.boardNumber)
            .map(renderBoardResult)}
        </div>
      )}

      {/* Action buttons */}
      {(isMyTeam || isOrganizer) && !isBye && (
        <div className="px-4 pb-4 flex gap-2 flex-wrap">
          {/* Submit lineup button */}
          {isMyTeam && fixture.status === 'scheduled' && onSubmitLineup && (
            <>
              {canSubmitLineup(homeTeam?.id || '') && homeTeam?.captainId && (
                <button
                  onClick={() => onSubmitLineup(fixture, homeTeam.id)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                >
                  Submit Home Lineup
                </button>
              )}
              {canSubmitLineup(awayTeam?.id || '') && awayTeam?.captainId && (
                <button
                  onClick={() => onSubmitLineup(fixture, awayTeam.id)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                >
                  Submit Away Lineup
                </button>
              )}
            </>
          )}

          {/* Enter score button */}
          {(isMyTeam || isOrganizer) &&
            (fixture.status === 'lineups_submitted' || fixture.status === 'in_progress') &&
            onEnterScore && (
              <button
                onClick={() => onEnterScore(fixture)}
                className="px-3 py-1.5 bg-lime-600 hover:bg-lime-500 text-white text-sm rounded-lg transition-colors"
              >
                Enter Scores
              </button>
            )}

          {/* View details button */}
          {onViewDetails && (
            <button
              onClick={() => onViewDetails(fixture)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              View Details
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamLeagueFixtureCard;
