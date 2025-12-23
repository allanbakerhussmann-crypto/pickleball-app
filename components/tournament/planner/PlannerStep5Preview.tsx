/**
 * Tournament Planner - Step 5: Preview (Multi-Day Support)
 *
 * Final preview showing timeline, summary, and any warnings.
 *
 * FILE LOCATION: components/tournament/planner/PlannerStep5Preview.tsx
 * VERSION: V06.00
 */

import React from 'react';
import type { TournamentPlannerSettings, PlannerCapacity, TournamentDay } from '../../../types';
import { MATCH_PRESETS } from '../../../types';

interface PlannerStep5PreviewProps {
  settings: TournamentPlannerSettings;
  capacity: PlannerCapacity;
}

// Colors for timeline bars
const DIVISION_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-pink-500',
  'bg-cyan-500',
];

// Format date for display
const formatDateDisplay = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export const PlannerStep5Preview: React.FC<PlannerStep5PreviewProps> = ({
  settings,
  capacity,
}) => {
  // Parse time for timeline positioning
  const parseTimeToMinutes = (time: string): number => {
    // Handle both "HH:MM" and "H:MM AM/PM" formats
    if (time.includes('AM') || time.includes('PM')) {
      const [timePart, period] = time.split(' ');
      const [hours, minutes] = timePart.split(':').map(Number);
      const hours24 = period === 'PM' && hours !== 12 ? hours + 12 : hours === 12 && period === 'AM' ? 0 : hours;
      return hours24 * 60 + minutes;
    }
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Get tournament days (handle legacy single-day format)
  const tournamentDays = settings.days && settings.days.length > 0
    ? settings.days
    : [{
        id: 'day-1',
        date: new Date().toISOString().split('T')[0],
        startTime: settings.startTime,
        endTime: settings.endTime,
        label: 'Day 1',
      }];

  const isMultiDay = tournamentDays.length > 1;

  // Generate hour markers for a day
  const generateHourMarkers = (day: TournamentDay) => {
    const startMinutes = parseTimeToMinutes(day.startTime);
    const endMinutes = parseTimeToMinutes(day.endTime);
    const totalMinutes = endMinutes - startMinutes;
    const startHour = Math.floor(startMinutes / 60);
    const endHour = Math.ceil(endMinutes / 60);

    return Array.from({ length: endHour - startHour + 1 }, (_, i) => {
      const hour24 = startHour + i;
      const hour12 = hour24 % 12 || 12;
      const ampm = hour24 < 12 ? 'AM' : 'PM';
      return {
        hour: hour24,
        label: `${hour12}${ampm}`,
        position: ((hour24 * 60 - startMinutes) / totalMinutes) * 100,
      };
    }).filter((m) => m.position >= 0 && m.position <= 100);
  };

  // Group divisions by day
  const getDivisionsForDay = (dayId: string) => {
    return capacity.divisionBreakdown.filter((div) => div.dayId === dayId);
  };

  // Render timeline for a single day
  const renderDayTimeline = (day: TournamentDay, dayIndex: number) => {
    const divisions = getDivisionsForDay(day.id);
    if (divisions.length === 0) return null;

    const startMinutes = parseTimeToMinutes(day.startTime);
    const endMinutes = parseTimeToMinutes(day.endTime);
    const totalMinutes = endMinutes - startMinutes;
    const hourMarkers = generateHourMarkers(day);

    return (
      <div key={day.id} className="mb-4">
        {/* Day header */}
        {isMultiDay && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{dayIndex === 0 ? '🏁' : dayIndex === tournamentDays.length - 1 ? '🏆' : '📆'}</span>
            <span className="text-white font-medium">{day.label || `Day ${dayIndex + 1}`}</span>
            <span className="text-gray-400 text-sm">- {formatDateDisplay(day.date)}</span>
          </div>
        )}

        {/* Hour markers */}
        <div className="relative h-5 mb-1">
          {hourMarkers.map((marker) => (
            <div
              key={marker.hour}
              className="absolute text-xs text-gray-400"
              style={{ left: `${marker.position}%`, transform: 'translateX(-50%)' }}
            >
              {marker.label}
            </div>
          ))}
        </div>

        {/* Divisions */}
        <div className="space-y-2">
          {divisions.map((div, index) => {
            // Parse start/end times
            const divStart = parseTimeToMinutes(div.startTime);
            const divEnd = parseTimeToMinutes(div.endTime);

            // Calculate position and width
            const left = Math.max(0, ((divStart - startMinutes) / totalMinutes) * 100);
            const width = Math.min(
              100 - left,
              ((divEnd - divStart) / totalMinutes) * 100
            );

            // Find global index for consistent coloring
            const globalIndex = capacity.divisionBreakdown.findIndex((d) => d.divisionId === div.divisionId);

            return (
              <div key={div.divisionId} className="relative h-8">
                {/* Background track */}
                <div className="absolute inset-0 bg-gray-600 rounded" />

                {/* Division bar */}
                <div
                  className={`absolute h-full ${DIVISION_COLORS[globalIndex % DIVISION_COLORS.length]} rounded flex items-center px-2 overflow-hidden`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 5)}%` }}
                >
                  <span className="text-white text-xs font-medium truncate">
                    {div.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">📅</span>
        <h2 className="text-2xl font-bold text-white mb-2">
          Your Tournament Preview
        </h2>
        <p className="text-gray-400">
          Review your {isMultiDay ? `${tournamentDays.length}-day ` : ''}tournament plan before creating
        </p>
      </div>

      {/* Timeline */}
      {settings.divisions.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4 mb-6">
          <h3 className="text-sm text-gray-400 mb-4">
            {isMultiDay ? 'SCHEDULE BY DAY' : 'TIMELINE'}
          </h3>

          {tournamentDays.map((day, index) => renderDayTimeline(day, index))}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-600 text-sm">
            {capacity.divisionBreakdown.map((div, index) => (
              <div key={div.divisionId} className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded ${DIVISION_COLORS[index % DIVISION_COLORS.length]}`}
                />
                <span className="text-gray-300">
                  {div.name} ({div.startTime} - {div.endTime})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className={`grid ${isMultiDay ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-4 mb-6`}>
        {isMultiDay && (
          <div className="bg-gray-700 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-white">{tournamentDays.length}</div>
            <div className="text-sm text-gray-400">Days</div>
          </div>
        )}
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-white">{capacity.totalPlayers}</div>
          <div className="text-sm text-gray-400">Players</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-white">{capacity.totalMatches}</div>
          <div className="text-sm text-gray-400">Matches</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-white">
            {capacity.totalHours.toFixed(1)}
          </div>
          <div className="text-sm text-gray-400">Hours</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-white">{settings.courts}</div>
          <div className="text-sm text-gray-400">Courts</div>
        </div>
      </div>

      {/* Settings summary */}
      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <h3 className="text-sm text-gray-400 mb-3">MATCH SETTINGS</h3>

        {/* Pool vs Medal settings */}
        {settings.useSeparateMedalSettings ? (
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Pool Play */}
            <div className="p-3 bg-gray-600 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span>🏐</span>
                <span className="text-white font-medium">Pool Play</span>
              </div>
              <div className="text-sm text-gray-300 space-y-1">
                <div>
                  {settings.poolGameSettings.bestOf === 1
                    ? '1 game'
                    : `Best of ${settings.poolGameSettings.bestOf}`} to {settings.poolGameSettings.pointsToWin}
                </div>
                <div className="text-gray-400">Win by {settings.poolGameSettings.winBy}</div>
              </div>
            </div>

            {/* Medal Rounds */}
            <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span>🏆</span>
                <span className="text-white font-medium">Medal Rounds</span>
              </div>
              <div className="text-sm text-amber-200 space-y-1">
                <div>
                  {settings.medalGameSettings.bestOf === 1
                    ? '1 game'
                    : `Best of ${settings.medalGameSettings.bestOf}`} to {settings.medalGameSettings.pointsToWin}
                </div>
                <div className="text-amber-300/70">Win by {settings.medalGameSettings.winBy}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <span className="text-gray-400">Format:</span>
              <span className="text-white ml-2">
                {MATCH_PRESETS[settings.matchPreset]?.label || 'Custom'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Points:</span>
              <span className="text-white ml-2">{settings.poolGameSettings.pointsToWin}</span>
            </div>
            <div>
              <span className="text-gray-400">Win By:</span>
              <span className="text-white ml-2">{settings.poolGameSettings.winBy}</span>
            </div>
            <div>
              <span className="text-gray-400">Games:</span>
              <span className="text-white ml-2">
                {settings.poolGameSettings.bestOf === 1
                  ? '1 game'
                  : `Best of ${settings.poolGameSettings.bestOf}`}
              </span>
            </div>
          </div>
        )}

        {/* Timing settings */}
        <div className="grid grid-cols-3 gap-4 text-sm pt-3 border-t border-gray-600">
          <div>
            <span className="text-gray-400">Warmup:</span>
            <span className="text-white ml-2">{settings.timingSettings.warmupMinutes} min</span>
          </div>
          <div>
            <span className="text-gray-400">Rest:</span>
            <span className="text-white ml-2">{settings.timingSettings.restMinutes} min</span>
          </div>
          <div>
            <span className="text-gray-400">Transition:</span>
            <span className="text-white ml-2">{settings.timingSettings.courtChangeMinutes} min</span>
          </div>
        </div>
      </div>

      {/* Per-day breakdown for multi-day */}
      {isMultiDay && capacity.dayBreakdown && (
        <div className="bg-gray-700 rounded-lg p-4 mb-6">
          <h3 className="text-sm text-gray-400 mb-3">DAY BREAKDOWN</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {capacity.dayBreakdown.map((day, index) => {
              const dayData = tournamentDays.find((d) => d.id === day.dayId);
              return (
                <div
                  key={day.dayId}
                  className={`p-3 rounded-lg border ${
                    day.fitsInTimeframe
                      ? 'bg-gray-600/50 border-gray-600'
                      : 'bg-amber-900/20 border-amber-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">
                      {day.label || `Day ${index + 1}`}
                    </span>
                    <span className="text-xs text-gray-400">
                      {dayData && formatDateDisplay(dayData.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400">
                      Utilization: <span className="text-white">{day.utilizationPercent}%</span>
                    </span>
                    {!day.fitsInTimeframe && (
                      <span className="text-amber-400 text-xs">Over capacity</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status */}
      {capacity.fitsInTimeframe ? (
        <div className="p-4 bg-green-900/30 border border-green-700 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-green-400 text-xl">✅</span>
            <div>
              <p className="font-medium text-green-400">
                Tournament fits in your {isMultiDay ? `${tournamentDays.length}-day schedule` : 'time window'}
              </p>
              <p className="text-sm text-green-300/80 mt-1">
                Court utilization: {capacity.utilizationPercent}%
                {capacity.suggestions.length > 0 && ` • ${capacity.suggestions[0]}`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 text-xl">⚠️</span>
            <div>
              <p className="font-medium text-amber-400">
                {capacity.warningMessages[0]}
              </p>
              {capacity.suggestions.length > 0 && (
                <ul className="text-sm text-amber-300/80 mt-2 space-y-1">
                  {capacity.suggestions.slice(0, 3).map((suggestion, i) => (
                    <li key={i}>💡 {suggestion}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-division conflict warning */}
      {settings.divisions.length > 1 && (
        <div className="mt-4 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-blue-400 text-lg">ℹ️</span>
            <div className="text-sm text-blue-200">
              <p className="font-medium">Multiple divisions detected</p>
              <p className="text-blue-300/80 mt-1">
                Players entering multiple divisions may have scheduling conflicts. We'll
                detect and help you resolve these in the Schedule Builder after registration
                closes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlannerStep5Preview;
