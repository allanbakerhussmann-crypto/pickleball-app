/**
 * LeagueScheduleCard - Shows league schedule with box/court/session info
 *
 * Displays:
 * - League name and club
 * - Next/current week info
 * - User's box, court, and session time
 * - Upcoming matches for the user
 *
 * V07.49: Initial implementation
 *
 * FILE LOCATION: components/myevents/LeagueScheduleCard.tsx
 * VERSION: V07.49
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveOrNextWeek } from '../../services/rotatingDoublesBox';
import { getMyMatchesForWeek } from '../../services/firebase/matches';
import { formatTime } from '../../utils/timeFormat';
import { UpcomingMatchCard } from './UpcomingMatchCard';
import type { League, Match } from '../../types';
import type { BoxLeagueWeek, BoxLeagueSession } from '../../types/rotatingDoublesBox';

interface LeagueScheduleCardProps {
  league: League;
  onClick?: () => void;
}

export const LeagueScheduleCard: React.FC<LeagueScheduleCardProps> = ({
  league,
  onClick,
}) => {
  const { currentUser } = useAuth();
  const [week, setWeek] = useState<BoxLeagueWeek | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get venue settings for session times
  const venue = league.settings?.rotatingDoublesBox?.venue;
  const sessions = venue?.sessions?.filter(s => s.active) || [];

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!currentUser?.uid || league.format !== 'rotating_doubles_box') {
        setIsLoading(false);
        return;
      }

      try {
        // Get the active or next week
        const activeWeek = await getActiveOrNextWeek(league.id);
        setWeek(activeWeek);

        if (activeWeek && activeWeek.state !== 'draft') {
          // Fetch matches for this week where user is a participant
          const userMatches = await getMyMatchesForWeek(
            league.id,
            activeWeek.seasonId,
            activeWeek.weekNumber,
            currentUser.uid
          );
          setMatches(userMatches);
        }
      } catch (err) {
        console.error('Failed to fetch league schedule:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedule();
  }, [league.id, league.format, currentUser?.uid]);

  // Find user's box number from boxAssignments
  const userBoxNumber = useMemo(() => {
    if (!week?.boxAssignments || !currentUser?.uid) return null;
    const box = week.boxAssignments.find(b =>
      b.playerIds.includes(currentUser.uid)
    );
    return box?.boxNumber ?? null;
  }, [week?.boxAssignments, currentUser?.uid]);

  // Find court assignment for user's box
  const courtAssignment = useMemo(() => {
    if (!week?.courtAssignments || userBoxNumber === null) return null;
    return week.courtAssignments.find(ca => ca.boxNumber === userBoxNumber);
  }, [week?.courtAssignments, userBoxNumber]);

  // Get session info
  const session: BoxLeagueSession | null = useMemo(() => {
    if (courtAssignment?.sessionIndex === undefined) return null;
    return sessions[courtAssignment.sessionIndex] ?? null;
  }, [courtAssignment?.sessionIndex, sessions]);

  // Format the scheduled date
  const formattedDate = useMemo(() => {
    if (!week?.scheduledDate) return null;
    const date = new Date(week.scheduledDate);
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }, [week?.scheduledDate]);

  // Get status badge info
  const getStatusBadge = () => {
    switch (league.status) {
      case 'active':
        return { label: 'Active', className: 'bg-lime-500/20 text-lime-400' };
      case 'registration':
        return { label: 'Registration', className: 'bg-blue-500/20 text-blue-400' };
      case 'registration_closed':
        return { label: 'Starting Soon', className: 'bg-yellow-500/20 text-yellow-400' };
      case 'completed':
        return { label: 'Completed', className: 'bg-gray-500/20 text-gray-400' };
      default:
        return null;
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      onClick={onClick}
      className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden hover:border-gray-600/50 transition-colors cursor-pointer"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white truncate">{league.name}</h3>
            <p className="text-sm text-gray-400 truncate">{league.clubName}</p>
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {statusBadge && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
            )}
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Schedule Info */}
      {isLoading ? (
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin h-5 w-5 border-2 border-lime-500 border-t-transparent rounded-full" />
        </div>
      ) : week ? (
        <div className="p-4 space-y-4">
          {/* Week Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-300">
                Week {week.weekNumber}
              </span>
              {formattedDate && (
                <span className="text-sm text-gray-500">• {formattedDate}</span>
              )}
            </div>
            <span className={`px-2 py-0.5 rounded text-xs ${
              week.state === 'active' ? 'bg-lime-500/20 text-lime-400' :
              week.state === 'draft' ? 'bg-yellow-500/20 text-yellow-400' :
              week.state === 'finalized' ? 'bg-gray-500/20 text-gray-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              {week.state === 'draft' ? 'Upcoming' : week.state}
            </span>
          </div>

          {/* Box/Court/Session Info */}
          {userBoxNumber !== null && (
            <div className="grid grid-cols-3 gap-3">
              {/* Box */}
              <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Box</div>
                <div className="text-lg font-bold text-white">{userBoxNumber}</div>
              </div>

              {/* Court */}
              <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Court</div>
                <div className="text-lg font-bold text-white">
                  {courtAssignment?.courtLabel || '—'}
                </div>
              </div>

              {/* Time */}
              <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Time</div>
                <div className="text-lg font-bold text-white">
                  {session ? formatTime(session.startTime) : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Matches */}
          {matches.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Your Matches</div>
              {matches.slice(0, 3).map(match => (
                <UpcomingMatchCard
                  key={match.id}
                  match={match}
                  leagueId={league.id}
                  currentUserId={currentUser?.uid || ''}
                />
              ))}
              {matches.length > 3 && (
                <div className="text-xs text-gray-500 text-center py-1">
                  +{matches.length - 3} more matches
                </div>
              )}
            </div>
          )}

          {/* No matches yet */}
          {week.state === 'draft' && (
            <div className="text-sm text-gray-500 text-center py-2">
              Matches will be generated when week is activated
            </div>
          )}

          {week.state === 'active' && matches.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-2">
              No matches scheduled for you this week
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-500 text-center">
          No active week scheduled
        </div>
      )}
    </div>
  );
};

export default LeagueScheduleCard;
