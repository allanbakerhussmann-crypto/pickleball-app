/**
 * AttendanceSummary Component
 *
 * Displays attendance statistics for a meetup session/occurrence.
 * Shows breakdown of registered players, checked in, no-shows, guests,
 * and total played count.
 *
 * @version 07.58
 * @file components/clubs/AttendanceSummary.tsx
 */

import React from 'react';

interface AttendanceSummaryProps {
  occurrence: {
    expectedCount: number;
    checkedInCount: number;
    noShowCount: number;
    cancelledCount: number;
    guestCount: number;
    guestRevenue: number;
    closedAt?: number;
    status: string;
  };
  currency?: 'nzd' | 'aud' | 'usd';
}

/**
 * Format currency amount from cents
 */
const formatCurrency = (cents: number, currency: 'nzd' | 'aud' | 'usd' = 'nzd'): string => {
  const symbol = currency === 'usd' ? 'US$' : currency === 'aud' ? 'A$' : '$';
  return `${symbol}${(cents / 100).toFixed(2)}`;
};

export const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({
  occurrence,
  currency = 'nzd',
}) => {
  // Calculate totals according to the counting rules
  const totalRegistered = occurrence.expectedCount + occurrence.checkedInCount + occurrence.noShowCount;
  const totalPlayed = occurrence.checkedInCount + occurrence.guestCount;

  return (
    <div className="space-y-4">
      {/* Session Status Badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Attendance Summary
        </h4>
        {occurrence.closedAt ? (
          <span className="px-3 py-1 bg-gray-600/30 text-gray-400 text-xs font-medium rounded-full flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Session Closed
          </span>
        ) : (
          <span className="px-3 py-1 bg-green-600/30 text-green-400 text-xs font-medium rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Session Open
          </span>
        )}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Played - Highlighted */}
        <div className="col-span-2 md:col-span-1 bg-lime-600/10 border border-lime-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-lime-400 text-sm font-medium">Total Played</span>
          </div>
          <p className="text-4xl font-bold text-lime-500">{totalPlayed}</p>
          <p className="text-gray-500 text-xs mt-1">
            {occurrence.checkedInCount} registered + {occurrence.guestCount} guests
          </p>
        </div>

        {/* Registered Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-gray-400 text-sm">Registered</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalRegistered}</p>
        </div>

        {/* Checked In Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-gray-400 text-sm">Checked In</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{occurrence.checkedInCount}</p>
        </div>

        {/* Guests Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-gray-400 text-sm">Guests</span>
          </div>
          <p className="text-2xl font-bold text-purple-400">{occurrence.guestCount}</p>
          {occurrence.guestRevenue > 0 && (
            <p className="text-gray-500 text-xs mt-1">
              {formatCurrency(occurrence.guestRevenue, currency)}
            </p>
          )}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <h5 className="text-sm font-medium text-gray-400 mb-3">Registered Breakdown</h5>
        <div className="space-y-2">
          {/* Checked In */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              <span className="text-gray-300 text-sm">Checked In</span>
            </div>
            <span className="text-green-400 font-medium">{occurrence.checkedInCount}</span>
          </div>

          {/* Expected (Waiting) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              <span className="text-gray-300 text-sm">Expected</span>
            </div>
            <span className="text-blue-400 font-medium">{occurrence.expectedCount}</span>
          </div>

          {/* No-Shows */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
              <span className="text-gray-300 text-sm">No-Shows</span>
            </div>
            <span className="text-red-400 font-medium">{occurrence.noShowCount}</span>
          </div>

          {/* Cancelled (if any) */}
          {occurrence.cancelledCount > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                <span className="text-gray-300 text-sm">Cancelled</span>
              </div>
              <span className="text-yellow-400 font-medium">{occurrence.cancelledCount}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 my-3"></div>

        {/* Total Registered */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm font-medium">Total Registered</span>
          <span className="text-white font-bold">{totalRegistered}</span>
        </div>
      </div>

      {/* Guest Revenue Summary (if any) */}
      {occurrence.guestCount > 0 && (
        <div className="bg-purple-900/20 border border-purple-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-purple-400 font-medium">Guest Revenue</span>
            </div>
            <span className="text-purple-300 text-xl font-bold">
              {formatCurrency(occurrence.guestRevenue, currency)}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-2">
            {occurrence.guestCount} guest{occurrence.guestCount !== 1 ? 's' : ''} at door
          </p>
        </div>
      )}
    </div>
  );
};

export default AttendanceSummary;
