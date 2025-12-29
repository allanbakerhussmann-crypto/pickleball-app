/**
 * Event Results Page
 *
 * Public spectator page showing live scores, upcoming matches, and standings.
 * Works for tournaments, leagues, and meetups.
 *
 * Route: /results/:eventId?type=tournament|league|meetup
 *
 * @version V06.19
 * @file pages/EventResultsPage.tsx
 */

import React from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useEventResultsData, EventType } from '../hooks/useEventResultsData';
import { EventResultsHeader } from '../components/results/EventResultsHeader';
import { OnCourtNowSection } from '../components/results/OnCourtNowSection';
import { NextUpSection } from '../components/results/NextUpSection';
import { ResultsTabs } from '../components/results/ResultsTabs';
import { EventResults } from '../components/results/EventResults';
import { SponsorFooter } from '../components/results/SponsorFooter';

const EventResultsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();

  // Get event type from query params or default to tournament
  const typeParam = (searchParams.get('type') as EventType) || 'tournament';

  const {
    event,
    eventType,
    loading,
    error,
    divisions,
    teams,
    matches,
    leagueMembers,
    meetupMatches,
    meetupStandings,
    activeDivisionId,
    setActiveDivisionId,
    onCourtNow,
    nextUp,
  } = useEventResultsData(eventId || '', typeParam);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-lime-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading event...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h1 className="text-xl font-bold text-white mb-2">Event Not Found</h1>
          <p className="text-gray-400 mb-4">{error || 'The event you\'re looking for doesn\'t exist.'}</p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-lime-500 text-gray-900 rounded-lg font-medium hover:bg-lime-400 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header with event info and sponsors */}
      <EventResultsHeader
        event={event}
        eventType={eventType}
      />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* On Court Now - Live matches */}
        {onCourtNow.length > 0 && (
          <OnCourtNowSection matches={onCourtNow} />
        )}

        {/* Next Up - Waiting queue */}
        {nextUp.length > 0 && (
          <NextUpSection matches={nextUp} />
        )}

        {/* Division/Category Tabs (for tournaments with multiple divisions) */}
        {eventType === 'tournament' && divisions.length > 1 && (
          <ResultsTabs
            divisions={divisions}
            activeDivisionId={activeDivisionId}
            onSelect={setActiveDivisionId}
            matches={matches}
          />
        )}

        {/* Results/Standings */}
        <EventResults
          eventType={eventType}
          event={event}
          divisions={divisions}
          teams={teams}
          matches={matches}
          activeDivisionId={activeDivisionId}
          leagueMembers={leagueMembers}
          meetupMatches={meetupMatches}
          meetupStandings={meetupStandings}
        />
      </div>

      {/* Sponsor Footer */}
      {event.sponsors && event.sponsors.length > 0 && (
        <SponsorFooter sponsors={event.sponsors} />
      )}
    </div>
  );
};

export default EventResultsPage;
