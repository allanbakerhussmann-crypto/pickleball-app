/**
 * LiveNowSection - Homepage live matches feed
 *
 * Shows currently active matches across all events with real-time scores.
 * Links to public results page for each event.
 *
 * @version V06.19
 * @file components/home/LiveNowSection.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { LiveMatch } from '../../hooks/useLiveMatches';

interface LiveNowSectionProps {
  matches: LiveMatch[];
  totalCount: number;
  loading?: boolean;
}

export const LiveNowSection: React.FC<LiveNowSectionProps> = ({
  matches,
  totalCount,
  loading = false,
}) => {
  const navigate = useNavigate();

  // Don't render if no live matches
  if (!loading && matches.length === 0) {
    return null;
  }

  // Navigate to results page for an event
  const handleViewResults = (match: LiveMatch) => {
    navigate(`/results/${match.eventId}?type=${match.eventType}`);
  };

  // Get event type color
  const getEventColor = (type: LiveMatch['eventType']) => {
    switch (type) {
      case 'tournament':
        return 'purple';
      case 'league':
        return 'blue';
      case 'meetup':
        return 'green';
      default:
        return 'gray';
    }
  };

  // Get event type icon
  const getEventIcon = (type: LiveMatch['eventType']) => {
    switch (type) {
      case 'tournament':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        );
      case 'league':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        );
      case 'meetup':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
    }
  };

  return (
    <section className="mb-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Pulsing LIVE indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-full border border-red-500/30">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-sm font-bold text-red-400 uppercase tracking-wide">Live Now</span>
          </div>
        </div>

        {/* View all link if more matches */}
        {totalCount > 4 && (
          <span className="text-sm text-gray-400">
            Showing 4 of {totalCount} live matches
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700 animate-pulse">
              <div className="h-4 bg-gray-700 rounded w-1/3 mb-3"></div>
              <div className="h-6 bg-gray-700 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : (
        /* Live Match Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((match) => {
            const color = getEventColor(match.eventType);

            return (
              <button
                key={`${match.eventType}-${match.eventId}-${match.id}`}
                onClick={() => handleViewResults(match)}
                className={`bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-${color}-500/50 transition-all text-left group`}
              >
                {/* Event Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-${color}-400`}>
                      {getEventIcon(match.eventType)}
                    </span>
                    <span className="text-sm font-medium text-gray-300 truncate max-w-[180px]">
                      {match.eventName}
                    </span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full bg-${color}-500/20 border border-${color}-500/30`}>
                    <span className={`text-xs font-semibold text-${color}-400`}>
                      Court {match.court}
                    </span>
                  </div>
                </div>

                {/* Match Score */}
                <div className="flex items-center justify-between gap-4">
                  {/* Team A */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold truncate">
                      {match.sideAName}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 rounded-lg">
                    <span className="text-xl font-bold text-lime-400 tabular-nums">
                      {match.currentScore.a}
                    </span>
                    <span className="text-gray-500">-</span>
                    <span className="text-xl font-bold text-lime-400 tabular-nums">
                      {match.currentScore.b}
                    </span>
                  </div>

                  {/* Team B */}
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-white font-semibold truncate">
                      {match.sideBName}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
                  <span className="text-xs text-gray-500">
                    Game {match.gameNumber}
                    {match.divisionName && ` • ${match.divisionName}`}
                  </span>
                  <span className={`text-xs font-medium text-${color}-400 group-hover:text-${color}-300 flex items-center gap-1`}>
                    View Results
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default LiveNowSection;
