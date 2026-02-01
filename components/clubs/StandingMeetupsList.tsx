/**
 * StandingMeetupsList Component
 *
 * Displays weekly meetups for a club with options to create new ones.
 * Shows upcoming sessions, subscriber count, and quick actions.
 *
 * @version 07.57
 * @file components/clubs/StandingMeetupsList.tsx
 */

import React, { useEffect, useState } from 'react';
import { subscribeToClubStandingMeetups } from '../../services/firebase/standingMeetups';
import type { StandingMeetup } from '../../types/standingMeetup';
import { formatTime } from '../../utils/timeFormat';

interface StandingMeetupsListProps {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
  onCreateNew: () => void;
  onViewMeetup: (meetupId: string) => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const StandingMeetupsList: React.FC<StandingMeetupsListProps> = ({
  clubId,
  clubName: _clubName,
  isAdmin,
  onCreateNew,
  onViewMeetup,
}) => {
  void _clubName; // Reserved for future features
  const [meetups, setMeetups] = useState<StandingMeetup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToClubStandingMeetups(
      clubId,
      (data) => {
        setMeetups(data);
        setLoading(false);
      },
      { status: 'active' }
    );

    return () => {
      try {
        unsubscribe();
      } catch (err) {
        // Ignore Firestore SDK errors during cleanup (race condition bug in SDK 12.6.0)
        console.debug('Subscription cleanup error (safe to ignore):', err);
      }
    };
  }, [clubId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Weekly Meetups</h2>
          <p className="text-gray-400 text-sm">
            Recurring weekly sessions with subscription payments
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={onCreateNew}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Weekly Meetup
          </button>
        )}
      </div>

      {/* Meetups List */}
      {meetups.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-white mb-2">No Weekly Meetups Yet</h3>
          <p className="text-gray-400 mb-4">
            {isAdmin
              ? 'Create your first weekly meetup to offer recurring sessions with subscription payments.'
              : 'This club has not created any weekly meetups yet.'}
          </p>
          {isAdmin && (
            <button
              onClick={onCreateNew}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Create First Weekly Meetup
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {meetups.map((meetup) => (
            <div
              key={meetup.id}
              className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors cursor-pointer"
              onClick={() => onViewMeetup(meetup.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{meetup.title}</h3>
                  <p className="text-gray-400 text-sm mb-3">{meetup.description}</p>

                  <div className="flex flex-wrap gap-4 text-sm">
                    {/* Schedule */}
                    {meetup.recurrence && (
                      <div className="flex items-center gap-2 text-gray-300">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          {DAY_NAMES[meetup.recurrence.dayOfWeek]}s {formatTime(meetup.recurrence.startTime)} - {formatTime(meetup.recurrence.endTime)}
                        </span>
                      </div>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-2 text-gray-300">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{meetup.locationName}</span>
                    </div>

                    {/* Capacity */}
                    <div className="flex items-center gap-2 text-gray-300">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>{meetup.subscriberCount}/{meetup.maxPlayers} subscribers</span>
                    </div>
                  </div>
                </div>

                {/* Price Badge */}
                {meetup.billing && (
                  <div className="text-right ml-4">
                    <div className="bg-green-600/20 border border-green-600/50 text-green-400 px-3 py-1 rounded-lg text-sm font-semibold">
                      ${((meetup.billing.perSessionAmount || meetup.billing.amount) / 100).toFixed(2)}/session
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {meetup.billing.currency.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>

              {/* View Details Link */}
              <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {meetup.recurrence?.startDate
                    ? `Started ${new Date(meetup.recurrence.startDate).toLocaleDateString()}`
                    : 'Schedule pending'}
                </span>
                <span className="text-green-400 text-sm font-medium flex items-center gap-1">
                  View Details
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StandingMeetupsList;
