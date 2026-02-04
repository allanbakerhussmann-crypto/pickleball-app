/**
 * SessionHistory Component
 *
 * Displays past session history for a standing meetup with aggregate stats
 * and a list of past sessions. Each session is clickable to view full
 * attendance details via OccurrenceManager.
 *
 * @version 07.61
 * @file components/clubs/SessionHistory.tsx
 */

import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToOccurrences } from '../../services/firebase/standingMeetups';
import { formatTime } from '../../utils/timeFormat';
import type { MeetupOccurrence } from '../../types/standingMeetup';

interface SessionHistoryProps {
  standingMeetupId: string;
  meetupTitle: string;
  currency: 'nzd' | 'aud' | 'usd';
  perSessionAmount: number;
  onSelectOccurrence: (occurrence: MeetupOccurrence) => void;
}

const formatCurrency = (cents: number, currency: 'nzd' | 'aud' | 'usd' = 'nzd'): string => {
  const symbol = currency === 'usd' ? 'US$' : currency === 'aud' ? 'A$' : '$';
  return `${symbol}${(cents / 100).toFixed(2)}`;
};

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  standingMeetupId,
  currency,
  onSelectOccurrence,
}) => {
  const [pastOccurrences, setPastOccurrences] = useState<MeetupOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideCancelled, setHideCancelled] = useState(false);

  useEffect(() => {
    const unsub = subscribeToOccurrences(
      standingMeetupId,
      (data) => {
        setPastOccurrences(data);
        setLoading(false);
      },
      { past: true, limit: 20 }
    );

    return () => unsub();
  }, [standingMeetupId]);

  // Client-side filter for cancelled sessions
  const filteredOccurrences = useMemo(() => {
    if (hideCancelled) {
      return pastOccurrences.filter(o => o.status !== 'cancelled');
    }
    return pastOccurrences;
  }, [pastOccurrences, hideCancelled]);

  // Aggregate stats computed over completed (non-cancelled) sessions
  const stats = useMemo(() => {
    const completed = pastOccurrences.filter(o => o.status !== 'cancelled');
    const total = completed.length;
    const totalPlayed = completed.reduce((s, o) => s + o.checkedInCount + (o.guestCount || 0), 0);
    const avgAttendance = total > 0 ? Math.round(totalPlayed / total) : 0;
    const totalGuests = completed.reduce((s, o) => s + (o.guestCount || 0), 0);
    const totalGuestRevenue = completed.reduce((s, o) => s + (o.guestRevenue || 0), 0);
    const cancelledCount = pastOccurrences.filter(o => o.status === 'cancelled').length;
    return { total, avgAttendance, totalGuests, totalGuestRevenue, cancelledCount };
  }, [pastOccurrences]);

  const formatOccurrenceDate = (occurrence: MeetupOccurrence) => {
    const date = new Date(occurrence.date + 'T00:00:00');
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: MeetupOccurrence['status']) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 bg-gray-600/30 text-gray-400 text-xs rounded-full">Completed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 bg-red-600/30 text-red-400 text-xs rounded-full">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 bg-blue-600/30 text-blue-400 text-xs rounded-full">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aggregate Stats */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Session History</h3>

        {pastOccurrences.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-400">No past sessions yet</p>
            <p className="text-gray-500 text-sm mt-1">History will appear here after sessions are completed</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {/* Total Sessions */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-400 text-sm">Sessions</span>
                </div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                {stats.cancelledCount > 0 && (
                  <p className="text-gray-500 text-xs mt-1">{stats.cancelledCount} cancelled</p>
                )}
              </div>

              {/* Average Attendance - Highlighted */}
              <div className="bg-lime-600/10 border border-lime-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-lime-400 text-sm">Avg Played</span>
                </div>
                <p className="text-2xl font-bold text-lime-500">
                  {stats.total > 0 ? stats.avgAttendance : 'N/A'}
                </p>
                <p className="text-gray-500 text-xs mt-1">per session</p>
              </div>

              {/* Total Guests */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span className="text-gray-400 text-sm">Total Guests</span>
                </div>
                <p className="text-2xl font-bold text-purple-400">{stats.totalGuests}</p>
              </div>

              {/* Guest Revenue */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-gray-400 text-sm">Guest Revenue</span>
                </div>
                <p className="text-2xl font-bold text-green-400">
                  {formatCurrency(stats.totalGuestRevenue, currency)}
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            {stats.cancelledCount > 0 && (
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-700">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideCancelled}
                    onChange={(e) => setHideCancelled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0"
                  />
                  Hide cancelled sessions
                </label>
                <span className="text-gray-500 text-sm">
                  Showing {filteredOccurrences.length} of {pastOccurrences.length} sessions
                </span>
              </div>
            )}

            {/* Past Sessions List */}
            <div className="space-y-2">
              {filteredOccurrences.map((occurrence) => (
                <div
                  key={occurrence.id}
                  className={`flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border transition-colors ${
                    occurrence.status === 'cancelled'
                      ? 'border-gray-700/50 opacity-60'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[50px]">
                      <p className="text-white font-bold text-lg">
                        {new Date(occurrence.date + 'T00:00:00').getDate()}
                      </p>
                      <p className="text-gray-400 text-xs uppercase">
                        {new Date(occurrence.date + 'T00:00:00').toLocaleDateString('en-NZ', { month: 'short' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-white font-medium">{formatOccurrenceDate(occurrence)}</p>
                      <p className="text-gray-500 text-sm">
                        {formatTime(occurrence.startTime)} - {formatTime(occurrence.endTime)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Mini attendance stats */}
                    {occurrence.status !== 'cancelled' && (
                      <div className="hidden sm:flex items-center gap-3 text-sm">
                        <span className="text-green-400" title="Checked in">
                          {occurrence.checkedInCount}
                          <span className="text-gray-600 ml-0.5">in</span>
                        </span>
                        {(occurrence.guestCount || 0) > 0 && (
                          <span className="text-purple-400" title="Guests">
                            {occurrence.guestCount}
                            <span className="text-gray-600 ml-0.5">g</span>
                          </span>
                        )}
                        {occurrence.noShowCount > 0 && (
                          <span className="text-red-400" title="No-shows">
                            {occurrence.noShowCount}
                            <span className="text-gray-600 ml-0.5">ns</span>
                          </span>
                        )}
                      </div>
                    )}

                    {getStatusBadge(occurrence.status)}

                    <button
                      onClick={() => onSelectOccurrence(occurrence)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {pastOccurrences.length >= 20 && (
              <p className="text-gray-500 text-xs text-center mt-3">
                Showing last 20 sessions
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SessionHistory;
