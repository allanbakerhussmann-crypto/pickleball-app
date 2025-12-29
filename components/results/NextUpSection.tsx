/**
 * NextUpSection - Upcoming matches waiting for courts
 *
 * Displays the queue of matches that will play next.
 *
 * @version V06.19
 * @file components/results/NextUpSection.tsx
 */

import React from 'react';
import type { QueueMatch } from '../../hooks/useEventResultsData';

interface NextUpSectionProps {
  matches: QueueMatch[];
}

export const NextUpSection: React.FC<NextUpSectionProps> = ({ matches }) => {
  if (matches.length === 0) {
    return null;
  }

  return (
    <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-white/5">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Next Up
        </h2>

        <span className="text-xs text-gray-500">
          {matches.length} match{matches.length !== 1 ? 'es' : ''} waiting
        </span>
      </div>

      {/* Match List */}
      <div className="divide-y divide-white/5">
        {matches.map((match, index) => (
          <div
            key={match.id}
            className="flex items-center gap-4 px-4 py-3 hover:bg-gray-800/30 transition-colors"
          >
            {/* Queue Position */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-400">
                {index + 1}
              </span>
            </div>

            {/* Match Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white truncate">
                  {match.sideAName}
                </span>
                <span className="text-gray-500 text-sm">vs</span>
                <span className="font-medium text-white truncate">
                  {match.sideBName}
                </span>
              </div>

              {/* Division & Round */}
              <div className="flex items-center gap-2 mt-0.5">
                {match.divisionName && (
                  <span className="text-xs text-gray-500">
                    {match.divisionName}
                  </span>
                )}
                {match.roundNumber && (
                  <span className="text-xs text-gray-600">
                    • Round {match.roundNumber}
                  </span>
                )}
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex-shrink-0">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800/80 rounded-full text-xs text-gray-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Waiting
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default NextUpSection;
