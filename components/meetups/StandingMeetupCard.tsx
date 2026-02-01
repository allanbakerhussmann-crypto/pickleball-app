/**
 * StandingMeetupCard Component
 *
 * Discovery card for weekly meetups in the feed.
 * Shows key info: title, club, schedule, price, capacity.
 *
 * @version 07.57
 * @file components/meetups/StandingMeetupCard.tsx
 */

import React from 'react';
import { formatTime } from '../../utils/timeFormat';
import type { StandingMeetup } from '../../types/standingMeetup';

interface StandingMeetupCardProps {
  meetup: StandingMeetup;
  onClick?: () => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const StandingMeetupCard: React.FC<StandingMeetupCardProps> = ({
  meetup,
  onClick,
}) => {
  const formatCurrency = (cents: number): string => {
    const symbol = meetup.billing.currency === 'usd' ? 'US$' : meetup.billing.currency === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  const spotsLeft = meetup.maxPlayers - meetup.subscriberCount;
  const isFull = spotsLeft <= 0;

  return (
    <div
      onClick={onClick}
      className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden hover:border-lime-500/30 transition-colors cursor-pointer group"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white truncate group-hover:text-lime-400 transition-colors">
              {meetup.title}
            </h3>
            <p className="text-sm text-gray-400 truncate">{meetup.clubName}</p>
          </div>
          <div className="flex-shrink-0">
            <div className="text-right">
              <div className="text-lg font-bold text-lime-400">
                {formatCurrency(meetup.billing.amount)}
              </div>
              <div className="text-xs text-gray-500">one-time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        {/* Schedule */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-medium">
              {DAY_NAMES[meetup.recurrence.dayOfWeek]}s at {formatTime(meetup.recurrence.startTime)}
            </p>
            <p className="text-xs text-gray-500">
              {formatTime(meetup.recurrence.startTime)} - {formatTime(meetup.recurrence.endTime)}
            </p>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm truncate">{meetup.locationName}</p>
        </div>

        {/* Capacity */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm text-gray-400">
              {meetup.subscriberCount} / {meetup.maxPlayers} members
            </span>
          </div>
          {isFull ? (
            <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded-full font-medium">
              Full
            </span>
          ) : spotsLeft <= 3 ? (
            <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded-full font-medium">
              {spotsLeft} spots left
            </span>
          ) : (
            <span className="px-2 py-1 bg-lime-600/20 text-lime-400 text-xs rounded-full font-medium">
              {spotsLeft} spots
            </span>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg group-hover:bg-lime-600/10 transition-colors">
          <span className="text-sm text-gray-400 group-hover:text-lime-400 transition-colors">
            View Details
          </span>
          <svg className="w-5 h-5 text-gray-500 group-hover:text-lime-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default StandingMeetupCard;
