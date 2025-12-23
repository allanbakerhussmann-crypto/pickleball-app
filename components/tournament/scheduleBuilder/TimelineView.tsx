/**
 * Schedule Builder - Timeline View
 *
 * Visual timeline showing division blocks and scheduled matches.
 *
 * FILE LOCATION: components/tournament/scheduleBuilder/TimelineView.tsx
 * VERSION: V06.00
 */

import React, { useMemo } from 'react';
import type { TournamentDay, DivisionScheduleBlock, ScheduledMatch } from '../../../types';

interface TimelineViewProps {
  days: TournamentDay[];
  divisionBlocks: DivisionScheduleBlock[];
  matches: ScheduledMatch[];
}

/**
 * Parse time string to minutes from midnight
 */
function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  days,
  divisionBlocks,
  matches,
}) => {
  // Generate hour markers for a day
  const generateHourMarkers = (day: TournamentDay) => {
    const startMinutes = parseTime(day.startTime);
    const endMinutes = parseTime(day.endTime);
    const startHour = Math.floor(startMinutes / 60);
    const endHour = Math.ceil(endMinutes / 60);

    return Array.from({ length: endHour - startHour + 1 }, (_, i) => {
      const hour24 = startHour + i;
      const hour12 = hour24 % 12 || 12;
      const ampm = hour24 < 12 ? 'AM' : 'PM';
      return {
        hour: hour24,
        label: `${hour12}${ampm}`,
      };
    });
  };

  // Get blocks for a specific day
  const getBlocksForDay = (dayId: string) => {
    return divisionBlocks.filter((b) => b.dayId === dayId);
  };

  // Get matches for a specific day (grouped by time)
  const getMatchesForDay = (dayId: string) => {
    return matches
      .filter((m) => m.dayId === dayId)
      .sort((a, b) => parseTime(a.scheduledTime) - parseTime(b.scheduledTime));
  };

  // Render a single day timeline
  const renderDayTimeline = (day: TournamentDay, dayIndex: number) => {
    const blocks = getBlocksForDay(day.id);
    const dayMatches = getMatchesForDay(day.id);
    const hourMarkers = generateHourMarkers(day);

    const startMinutes = parseTime(day.startTime);
    const endMinutes = parseTime(day.endTime);
    const totalMinutes = endMinutes - startMinutes;

    // Calculate position for a time
    const getPosition = (time: string) => {
      const timeMinutes = parseTime(time);
      return ((timeMinutes - startMinutes) / totalMinutes) * 100;
    };

    // Calculate width for a time range
    const getWidth = (start: string, end: string) => {
      const startMin = parseTime(start);
      const endMin = parseTime(end);
      return ((endMin - startMin) / totalMinutes) * 100;
    };

    return (
      <div key={day.id} className="mb-6">
        {/* Day header */}
        {days.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">
              {dayIndex === 0 ? '🏁' : dayIndex === days.length - 1 ? '🏆' : '📆'}
            </span>
            <span className="text-white font-medium">
              {day.label || `Day ${dayIndex + 1}`}
            </span>
            <span className="text-gray-400 text-sm">
              {day.startTime} - {day.endTime}
            </span>
          </div>
        )}

        {/* Hour markers */}
        <div className="relative h-6 mb-2">
          {hourMarkers.map((marker, i) => {
            const position = ((marker.hour * 60 - startMinutes) / totalMinutes) * 100;
            if (position < 0 || position > 100) return null;
            return (
              <div
                key={marker.hour}
                className="absolute text-xs text-gray-400"
                style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
              >
                {marker.label}
              </div>
            );
          })}
        </div>

        {/* Timeline track */}
        <div className="relative bg-gray-700 rounded-lg h-2 mb-4">
          {/* Hour grid lines */}
          {hourMarkers.map((marker) => {
            const position = ((marker.hour * 60 - startMinutes) / totalMinutes) * 100;
            if (position <= 0 || position >= 100) return null;
            return (
              <div
                key={marker.hour}
                className="absolute top-0 bottom-0 w-px bg-gray-600"
                style={{ left: `${position}%` }}
              />
            );
          })}
        </div>

        {/* Division blocks */}
        <div className="space-y-2">
          {blocks.map((block) => {
            const left = getPosition(block.startTime);
            const width = getWidth(block.startTime, block.endTime);

            return (
              <div key={block.divisionId} className="relative h-10">
                {/* Background track */}
                <div className="absolute inset-0 bg-gray-700/50 rounded" />

                {/* Block */}
                <div
                  className="absolute h-full rounded flex items-center px-3 overflow-hidden transition-all hover:brightness-110"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 5)}%`,
                    backgroundColor: block.color,
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-white text-sm font-medium truncate">
                      {block.divisionName}
                    </span>
                    <span className="text-white/70 text-xs ml-2 flex-shrink-0">
                      {block.matchCount} matches
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Match list (when generated) */}
        {dayMatches.length > 0 && (
          <div className="mt-4 border-t border-gray-700 pt-4">
            <div className="text-sm text-gray-400 mb-2">
              {dayMatches.length} matches scheduled
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {dayMatches.slice(0, 12).map((match) => (
                <div
                  key={match.matchId}
                  className={`p-2 rounded text-xs ${
                    match.hasConflict
                      ? 'bg-red-900/30 border border-red-700'
                      : 'bg-gray-700'
                  }`}
                >
                  <div className="text-gray-400">{match.scheduledTime}</div>
                  <div className="text-white truncate">
                    {match.teamA.name} vs {match.teamB.name}
                  </div>
                  <div className="text-gray-500">{match.courtName}</div>
                </div>
              ))}
              {dayMatches.length > 12 && (
                <div className="p-2 rounded bg-gray-700 text-xs flex items-center justify-center text-gray-400">
                  +{dayMatches.length - 12} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (days.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No tournament days configured
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day, index) => renderDayTimeline(day, index))}

      {/* Legend */}
      {divisionBlocks.length > 0 && (
        <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-700">
          {divisionBlocks.map((block) => (
            <div key={block.divisionId} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: block.color }}
              />
              <span className="text-sm text-gray-300">{block.divisionName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelineView;
