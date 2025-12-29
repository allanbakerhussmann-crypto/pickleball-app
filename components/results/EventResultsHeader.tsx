/**
 * EventResultsHeader - Header component for public results page
 *
 * Displays event name, dates, venue, club branding, and sponsor logos.
 *
 * @version V06.19
 * @file components/results/EventResultsHeader.tsx
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ClubBrandingSection } from '../shared/ClubBrandingSection';
import { SponsorLogoStrip } from '../shared/SponsorLogoStrip';
import type { EventData, EventType } from '../../hooks/useEventResultsData';

interface EventResultsHeaderProps {
  event: EventData;
  eventType: EventType;
}

// Format date for display
const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('en-NZ', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Get status badge styling
const getStatusBadge = (status: string) => {
  switch (status) {
    case 'in_progress':
      return {
        label: 'LIVE',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
        pulse: true,
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        pulse: false,
      };
    case 'upcoming':
    case 'published':
    case 'registration_open':
      return {
        label: 'Upcoming',
        className: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
        pulse: false,
      };
    default:
      return {
        label: status,
        className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        pulse: false,
      };
  }
};

// Get event detail URL
const getEventUrl = (eventType: EventType, eventId: string): string => {
  switch (eventType) {
    case 'tournament':
      return `/#/tournaments/${eventId}`;
    case 'league':
      return `/#/leagues/${eventId}`;
    case 'meetup':
      return `/#/meetups/${eventId}`;
    default:
      return '/#/';
  }
};

export const EventResultsHeader: React.FC<EventResultsHeaderProps> = ({
  event,
  eventType,
}) => {
  const statusBadge = getStatusBadge(event.status);
  const hasSponsors = event.sponsors && event.sponsors.filter(s => s.isActive).length > 0;

  return (
    <header className="bg-gray-900 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Top row: Back button + Status */}
        <div className="flex items-center justify-between mb-3">
          <Link
            to={getEventUrl(eventType, event.id)}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to {eventType === 'tournament' ? 'Tournament' : eventType === 'league' ? 'League' : 'Meetup'}</span>
          </Link>

          {/* Status Badge */}
          <div
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
              ${statusBadge.className}
            `}
          >
            {statusBadge.pulse && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
            {statusBadge.label}
          </div>
        </div>

        {/* Event Name */}
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          {event.name}
        </h1>

        {/* Event Details Row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400 mb-4">
          {/* Date */}
          {event.startDate && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>
                {formatDate(event.startDate)}
                {event.endDate && event.endDate !== event.startDate && (
                  <> - {formatDate(event.endDate)}</>
                )}
              </span>
            </div>
          )}

          {/* Location */}
          {(event.venue || event.location) && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{event.venue || event.location}</span>
            </div>
          )}

          {/* Organizer (if no club) */}
          {!event.clubId && event.organizerName && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>by {event.organizerName}</span>
            </div>
          )}
        </div>

        {/* Club Branding + Sponsors Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Club Branding */}
          {(event.clubId || event.clubName) && (
            <ClubBrandingSection
              clubId={event.clubId}
              clubName={event.clubName}
              variant="scoreboard"
            />
          )}

          {/* Sponsor Logos */}
          {hasSponsors && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Sponsors</span>
              <SponsorLogoStrip
                sponsors={event.sponsors!}
                variant="scoreboard"
                maxDisplay={4}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default EventResultsHeader;
