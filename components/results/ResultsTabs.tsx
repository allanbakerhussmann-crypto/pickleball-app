/**
 * ResultsTabs - Division/category selector tabs
 *
 * Displays tabs for selecting which division to view results for.
 * Shows completion progress for each division.
 *
 * @version V06.19
 * @file components/results/ResultsTabs.tsx
 */

import React from 'react';
import type { Division, Match } from '../../types';

interface ResultsTabsProps {
  divisions: Division[];
  activeDivisionId: string | null;
  onSelect: (divisionId: string) => void;
  matches: Match[];
}

// Calculate division completion percentage
const getDivisionProgress = (divisionId: string, matches: Match[]): { completed: number; total: number; percent: number } => {
  const divisionMatches = matches.filter(m => m.divisionId === divisionId);
  const completed = divisionMatches.filter(m => m.status === 'completed').length;
  const total = divisionMatches.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
};

export const ResultsTabs: React.FC<ResultsTabsProps> = ({
  divisions,
  activeDivisionId,
  onSelect,
  matches,
}) => {
  if (divisions.length === 0) {
    return null;
  }

  return (
    <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
      {/* Section Header */}
      <div className="px-4 py-3 bg-gray-800/50 border-b border-white/5">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Divisions
        </h2>
      </div>

      {/* Tabs */}
      <div className="p-2 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {divisions.map((division) => {
            const isActive = activeDivisionId === division.id;
            const progress = getDivisionProgress(division.id, matches);

            return (
              <button
                key={division.id}
                onClick={() => onSelect(division.id)}
                className={`
                  relative flex flex-col items-start gap-1 px-4 py-3 rounded-lg transition-all
                  min-w-[140px]
                  ${isActive
                    ? 'bg-lime-500/20 border border-lime-500/40'
                    : 'bg-gray-800/60 border border-white/5 hover:bg-gray-800 hover:border-white/10'
                  }
                `}
              >
                {/* Division Name */}
                <span className={`font-medium truncate max-w-[120px] ${isActive ? 'text-lime-400' : 'text-white'}`}>
                  {division.name}
                </span>

                {/* Progress Info */}
                <div className="flex items-center gap-2 w-full">
                  {/* Progress Bar */}
                  <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${isActive ? 'bg-lime-500' : 'bg-gray-500'}`}
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>

                  {/* Progress Text */}
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {progress.percent}%
                  </span>
                </div>

                {/* Match Count */}
                <span className="text-xs text-gray-500">
                  {progress.completed}/{progress.total} matches
                </span>

                {/* Status indicator for completed divisions */}
                {progress.percent === 100 && (
                  <div className="absolute top-2 right-2">
                    <svg className="w-4 h-4 text-lime-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ResultsTabs;
