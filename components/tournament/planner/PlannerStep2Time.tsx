/**
 * Tournament Planner - Step 2: Time Window (Multi-Day Support)
 *
 * User selects tournament dates and times for each day.
 *
 * FILE LOCATION: components/tournament/planner/PlannerStep2Time.tsx
 * VERSION: V06.00
 */

import React, { useMemo } from 'react';
import type { TournamentDay } from '../../../types';
import { createDefaultTournamentDay } from '../../../types';

interface PlannerStep2TimeProps {
  days: TournamentDay[];
  courts: number;
  onChange: (days: TournamentDay[]) => void;
}

// Generate time options from 6 AM to 10 PM in 30-minute increments
const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30; // Start at 6:00 AM
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hours12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return {
    value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    label: `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`,
  };
});

// Format date for display
const formatDateDisplay = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Format time for display
const formatTimeDisplay = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const hours12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Calculate hours for a single day
const calculateDayHours = (day: TournamentDay): number => {
  const [startH, startM] = day.startTime.split(':').map(Number);
  const [endH, endM] = day.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return Math.max(0, (endMinutes - startMinutes) / 60);
};

export const PlannerStep2Time: React.FC<PlannerStep2TimeProps> = ({
  days,
  courts,
  onChange,
}) => {
  // Calculate totals
  const { totalHours, totalCourtHours } = useMemo(() => {
    const totalHours = days.reduce((sum, day) => sum + calculateDayHours(day), 0);
    return {
      totalHours,
      totalCourtHours: totalHours * courts,
    };
  }, [days, courts]);

  // Add a new day
  const handleAddDay = () => {
    // Find the last date and add 1 day
    const lastDay = days[days.length - 1];
    const lastDate = new Date(lastDay.date + 'T12:00:00');
    lastDate.setDate(lastDate.getDate() + 1);
    const newDateStr = lastDate.toISOString().split('T')[0];

    const newDay: TournamentDay = {
      id: `day-${Date.now()}`,
      date: newDateStr,
      startTime: lastDay.startTime,
      endTime: lastDay.endTime,
      label: `Day ${days.length + 1}`,
    };

    onChange([...days, newDay]);
  };

  // Remove a day
  const handleRemoveDay = (dayId: string) => {
    if (days.length <= 1) return;
    onChange(days.filter((d) => d.id !== dayId));
  };

  // Update a day
  const handleUpdateDay = (dayId: string, updates: Partial<TournamentDay>) => {
    onChange(
      days.map((d) => (d.id === dayId ? { ...d, ...updates } : d))
    );
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">📅</span>
        <h2 className="text-2xl font-bold text-white mb-2">
          When is your tournament?
        </h2>
        <p className="text-gray-400">
          Add tournament days and set times for each
        </p>
      </div>

      {/* Days list */}
      <div className="space-y-4 mb-6">
        {days.map((day, index) => {
          const dayHours = calculateDayHours(day);

          return (
            <div
              key={day.id}
              className="bg-gray-700 rounded-lg p-4 border border-gray-600"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {index === 0 ? '🏁' : index === days.length - 1 && days.length > 1 ? '🏆' : '📆'}
                  </span>
                  <div>
                    <input
                      type="text"
                      value={day.label || `Day ${index + 1}`}
                      onChange={(e) => handleUpdateDay(day.id, { label: e.target.value })}
                      className="bg-transparent text-white font-medium text-lg focus:outline-none focus:border-b-2 focus:border-blue-500 w-32"
                      placeholder={`Day ${index + 1}`}
                    />
                  </div>
                </div>
                {days.length > 1 && (
                  <button
                    onClick={() => handleRemoveDay(day.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors p-1"
                    title="Remove day"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">DATE</label>
                  <input
                    type="date"
                    value={day.date}
                    onChange={(e) => handleUpdateDay(day.id, { date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Start Time */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">START</label>
                  <select
                    value={day.startTime}
                    onChange={(e) => handleUpdateDay(day.id, { startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">END</label>
                  <select
                    value={day.endTime}
                    onChange={(e) => handleUpdateDay(day.id, { endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day summary */}
              <div className="mt-3 pt-3 border-t border-gray-600 flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {formatDateDisplay(day.date)} • {formatTimeDisplay(day.startTime)} - {formatTimeDisplay(day.endTime)}
                </span>
                <span className="text-white font-medium">
                  {dayHours.toFixed(1)} hrs • {(dayHours * courts).toFixed(0)} court-hrs
                </span>
              </div>
            </div>
          );
        })}

        {/* Add day button */}
        <button
          onClick={handleAddDay}
          className="w-full p-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl">➕</span>
          Add Another Day
        </button>
      </div>

      {/* Total Stats */}
      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{days.length}</div>
            <div className="text-sm text-gray-400">{days.length === 1 ? 'day' : 'days'}</div>
          </div>
          <div className="w-px bg-gray-600" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{totalHours.toFixed(1)}</div>
            <div className="text-sm text-gray-400">total hours</div>
          </div>
          <div className="w-px bg-gray-600" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{totalCourtHours.toFixed(0)}</div>
            <div className="text-sm text-gray-400">court-hours</div>
          </div>
        </div>
      </div>

      {/* Multi-day info */}
      {days.length > 1 && (
        <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-blue-400 text-lg">💡</span>
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">Multi-day tournament</p>
              <p className="text-blue-300/80">
                You can assign divisions to specific days in the next step. Pool play often
                runs on Day 1, with medal rounds on Day 2.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Single day info */}
      {days.length === 1 && (
        <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-blue-400 text-lg">💡</span>
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">What are court-hours?</p>
              <p className="text-blue-300/80">
                With {courts} courts running for {totalHours.toFixed(1)} hours, you have{' '}
                {totalCourtHours.toFixed(0)} court-hours of total playing time. If each match takes
                ~15-20 minutes, that's roughly {Math.floor(totalCourtHours * 3)}-{Math.floor(totalCourtHours * 4)}{' '}
                matches.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlannerStep2Time;
