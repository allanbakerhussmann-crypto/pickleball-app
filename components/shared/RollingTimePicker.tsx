/**
 * RollingTimePicker Component
 *
 * A simple dropdown time picker with pre-set time options.
 * Matches the Tournament Planner style.
 *
 * @version 06.17
 * @file components/shared/RollingTimePicker.tsx
 */

import React from 'react';

// ============================================
// TYPES
// ============================================

interface RollingTimePickerProps {
  value: string;              // "HH:MM" format (24-hour)
  onChange: (time: string) => void;
  placeholder?: string;
  increment?: 15 | 30;        // Minutes between options (default: 30)
  startHour?: number;         // First hour to show (default: 6)
  endHour?: number;           // Last hour to show (default: 22)
}

// ============================================
// HELPERS
// ============================================

/**
 * Generate time options
 */
const generateTimeOptions = (
  increment: number = 30,
  startHour: number = 6,
  endHour: number = 22
): { value: string; label: string }[] => {
  const options: { value: string; label: string }[] = [];
  const intervalsPerHour = 60 / increment;
  const totalIntervals = (endHour - startHour) * intervalsPerHour + 1;

  for (let i = 0; i < totalIntervals; i++) {
    const totalMinutes = startHour * 60 + i * increment;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hours12 = hours % 12 || 12;
    const ampm = hours < 12 ? 'AM' : 'PM';

    options.push({
      value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      label: `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`,
    });
  }

  return options;
};

// ============================================
// MAIN COMPONENT
// ============================================

export const RollingTimePicker: React.FC<RollingTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select time',
  increment = 30,
  startHour = 6,
  endHour = 22,
}) => {
  const timeOptions = generateTimeOptions(increment, startHour, endHour);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500 appearance-none cursor-pointer"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
        backgroundSize: '1.25rem',
        paddingRight: '2.5rem',
      }}
    >
      {!value && <option value="">{placeholder}</option>}
      {timeOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export default RollingTimePicker;
