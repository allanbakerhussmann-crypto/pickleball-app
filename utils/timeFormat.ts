/**
 * Time Formatting Utilities
 *
 * Centralized time formatting for consistent display throughout the app.
 *
 * STANDARD:
 * - Store times internally in 24-hour format (e.g., "08:00", "14:30")
 * - Display times in 12-hour format with AM/PM (e.g., "8:00 AM", "2:30 PM")
 *
 * @version 06.17
 * @file utils/timeFormat.ts
 */

// ============================================
// TIME STRING FORMATTING (HH:MM -> display)
// ============================================

/**
 * Format a 24-hour time string to 12-hour display format
 * @param time - Time in "HH:MM" format (e.g., "08:00", "14:30")
 * @returns Formatted time string (e.g., "8:00 AM", "2:30 PM")
 */
export const formatTime = (time: string): string => {
  if (!time) return '';
  const [hours, mins] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, '0')} ${period}`;
};

/**
 * Format a 24-hour time string to short 12-hour format (no leading zero on minutes if :00)
 * @param time - Time in "HH:MM" format
 * @returns Formatted time string (e.g., "8 AM", "2:30 PM")
 */
export const formatTimeShort = (time: string): string => {
  if (!time) return '';
  const [hours, mins] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  if (mins === 0) {
    return `${hours12} ${period}`;
  }
  return `${hours12}:${mins.toString().padStart(2, '0')} ${period}`;
};

// ============================================
// TIMESTAMP FORMATTING (milliseconds -> display)
// ============================================

/**
 * Format a timestamp to 12-hour time display
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "8:00 AM")
 */
export const formatTimestamp = (timestamp: number): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-NZ', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Format a timestamp to date and time display
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted string (e.g., "Sun, Dec 28 at 8:00 AM")
 */
export const formatDateTime = (timestamp: number): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// ============================================
// MINUTES FORMATTING (minutes since midnight -> display)
// ============================================

/**
 * Format minutes since midnight to 12-hour display
 * @param minutes - Minutes since midnight (e.g., 480 = 8:00 AM)
 * @returns Formatted time string (e.g., "8:00 AM")
 */
export const formatMinutesToTime = (minutes: number): string => {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, '0')} ${period}`;
};

// ============================================
// TIME RANGE FORMATTING
// ============================================

/**
 * Format a time range for display
 * @param startTime - Start time in "HH:MM" format
 * @param endTime - End time in "HH:MM" format
 * @returns Formatted range (e.g., "8:00 AM - 10:00 AM")
 */
export const formatTimeRange = (startTime: string, endTime: string): string => {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
};

// ============================================
// PARSING UTILITIES
// ============================================

/**
 * Convert 12-hour time to 24-hour format
 * @param hour - Hour (1-12)
 * @param minute - Minute (0-59)
 * @param period - 'AM' or 'PM'
 * @returns Time in "HH:MM" format
 */
export const to24HourFormat = (hour: number, minute: number, period: 'AM' | 'PM'): string => {
  let hours24 = hour;
  if (period === 'AM' && hour === 12) {
    hours24 = 0;
  } else if (period === 'PM' && hour !== 12) {
    hours24 = hour + 12;
  }
  return `${hours24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

/**
 * Parse a 24-hour time string to components
 * @param time - Time in "HH:MM" format
 * @returns Object with hours, minutes, and period
 */
export const parseTime = (time: string): { hours: number; minutes: number; period: 'AM' | 'PM' } => {
  const [hours, minutes] = time.split(':').map(Number);
  return {
    hours: hours % 12 || 12,
    minutes,
    period: hours >= 12 ? 'PM' : 'AM',
  };
};

/**
 * Convert time string to minutes since midnight
 * @param time - Time in "HH:MM" format
 * @returns Minutes since midnight
 */
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
