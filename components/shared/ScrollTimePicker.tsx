/**
 * ScrollTimePicker Component
 *
 * Mobile-friendly time picker with plus/minus buttons.
 * Increments in 15-minute intervals.
 *
 * @version 07.58
 * @file components/shared/ScrollTimePicker.tsx
 */

import React from 'react';

interface ScrollTimePickerProps {
  value: string; // "HH:MM" 24-hour format
  onChange: (time: string) => void;
  label: string;
}

// Convert 24hr time string to minutes since midnight
function timeToMinutes(time24: string): number {
  const [hourStr, minStr] = time24.split(':');
  return parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
}

// Convert minutes since midnight to 24hr time string
function minutesToTime(minutes: number): string {
  // Clamp to valid range (0:00 - 23:45)
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 45));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Format for display (12-hour with AM/PM)
function formatTimeDisplay(time24: string): string {
  const [hourStr, minStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  const period = hour >= 12 ? 'PM' : 'AM';

  if (hour === 0) hour = 12;
  else if (hour > 12) hour = hour - 12;

  return `${hour}:${min.toString().padStart(2, '0')} ${period}`;
}

export const ScrollTimePicker: React.FC<ScrollTimePickerProps> = ({ value, onChange, label }) => {
  const minutes = timeToMinutes(value);

  const handleDecrement = () => {
    // Decrease by 15 minutes, minimum 0:00
    const newMinutes = Math.max(0, minutes - 15);
    onChange(minutesToTime(newMinutes));
  };

  const handleIncrement = () => {
    // Increase by 15 minutes, maximum 23:45
    const newMinutes = Math.min(23 * 60 + 45, minutes + 15);
    onChange(minutesToTime(newMinutes));
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      {/* Label */}
      <div className="text-sm font-medium text-gray-300 mb-3 text-center">{label}</div>

      {/* Plus/Minus Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
        >
          −
        </button>

        <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
          <span className="text-lime-400 text-xl font-bold font-mono">
            {formatTimeDisplay(value)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleIncrement}
          className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
        >
          +
        </button>
      </div>

      {/* 24hr format hint */}
      <div className="text-xs text-gray-500 text-center mt-2">
        {value}
      </div>
    </div>
  );
};

export default ScrollTimePicker;
