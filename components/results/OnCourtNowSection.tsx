/**
 * OnCourtNowSection - Live matches currently being played
 *
 * Displays matches with real-time scores and LIVE indicator.
 *
 * @version V06.19
 * @file components/results/OnCourtNowSection.tsx
 */

import React from 'react';
import type { QueueMatch } from '../../hooks/useEventResultsData';

interface OnCourtNowSectionProps {
  matches: QueueMatch[];
}

// Get game info
const getGameInfo = (match: QueueMatch): string => {
  if (!match.scores || match.scores.length === 0) {
    return 'Game 1';
  }
  return `Game ${match.scores.length}`;
};

// Get match status styling
const getStatusStyle = (status: string) => {
  if (status === 'in_progress') {
    return 'text-red-400';
  }
  return 'text-lime-400';
};

export const OnCourtNowSection: React.FC<OnCourtNowSectionProps> = ({ matches }) => {
  if (matches.length === 0) {
    return null;
  }

  return (
    <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-white/5">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          On Court Now
        </h2>

        {/* LIVE Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-xs font-semibold text-red-400">LIVE</span>
        </div>
      </div>

      {/* Match Cards Grid */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((match) => (
          <div
            key={match.id}
            className="bg-gray-800/60 rounded-lg p-4 border border-white/5 hover:border-lime-500/30 transition-colors"
          >
            {/* Court Badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-lime-500/20 rounded-full">
                <span className="text-xs font-semibold text-lime-400">
                  Court {match.court}
                </span>
              </div>

              {/* Division if available */}
              {match.divisionName && (
                <span className="text-xs text-gray-500 truncate max-w-[120px]">
                  {match.divisionName}
                </span>
              )}
            </div>

            {/* Teams & Score */}
            <div className="space-y-2">
              {/* Team A */}
              <div className="flex items-center justify-between">
                <span className="text-white font-medium truncate max-w-[150px]">
                  {match.sideAName}
                </span>
                <span className={`text-xl font-bold ${getStatusStyle(match.status)}`}>
                  {match.scores?.[match.scores.length - 1]?.scoreA ?? 0}
                </span>
              </div>

              {/* VS Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-700"></div>
                <span className="text-xs text-gray-500">vs</span>
                <div className="flex-1 h-px bg-gray-700"></div>
              </div>

              {/* Team B */}
              <div className="flex items-center justify-between">
                <span className="text-white font-medium truncate max-w-[150px]">
                  {match.sideBName}
                </span>
                <span className={`text-xl font-bold ${getStatusStyle(match.status)}`}>
                  {match.scores?.[match.scores.length - 1]?.scoreB ?? 0}
                </span>
              </div>
            </div>

            {/* Game Info */}
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {getGameInfo(match)}
              </span>
              {match.status === 'in_progress' && (
                <span className="text-xs text-red-400 font-medium">In Progress</span>
              )}
              {match.status === 'scheduled' && (
                <span className="text-xs text-lime-400 font-medium">Ready to Play</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default OnCourtNowSection;
