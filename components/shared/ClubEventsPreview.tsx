import React, { useState, useEffect } from 'react';
import { Tournament, League, Meetup } from '../../types';
import { getAllTournaments } from '../../services/firebase/tournaments';
import { getLeagues } from '../../services/firebase/leagues';
import { getMeetups } from '../../services/firebase/meetups';

/**
 * ClubEventsPreview - Shows upcoming events at a club
 *
 * Features:
 * - Lists tournaments, leagues, meetups at this venue
 * - Excludes the current event
 * - Shows date and type badges
 * - Links to event pages
 *
 * @version 06.19
 */

interface ClubEventsPreviewProps {
  clubId: string;
  excludeEventId?: string;
  excludeEventType?: 'tournament' | 'league' | 'meetup';
  maxEvents?: number;
  className?: string;
}

interface EventItem {
  id: string;
  name: string;
  type: 'tournament' | 'league' | 'meetup';
  date: number;
  status?: string;
}

export const ClubEventsPreview: React.FC<ClubEventsPreviewProps> = ({
  clubId,
  excludeEventId,
  excludeEventType,
  maxEvents = 3,
  className = '',
}) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    const fetchEvents = async () => {
      setLoading(true);
      try {
        const now = Date.now();
        const allEvents: EventItem[] = [];

        // Fetch tournaments
        const tournaments = await getAllTournaments();
        tournaments
          .filter(t => t.clubId === clubId && t.startDate >= now)
          .forEach(t => {
            if (excludeEventType === 'tournament' && t.id === excludeEventId) return;
            allEvents.push({
              id: t.id,
              name: t.name,
              type: 'tournament',
              date: t.startDate,
              status: t.status,
            });
          });

        // Fetch leagues
        const leagues = await getLeagues();
        leagues
          .filter(l => l.clubId === clubId && (l.startDate || 0) >= now)
          .forEach(l => {
            if (excludeEventType === 'league' && l.id === excludeEventId) return;
            allEvents.push({
              id: l.id,
              name: l.name,
              type: 'league',
              date: l.startDate || 0,
              status: l.status,
            });
          });

        // Fetch meetups
        const meetups = await getMeetups();
        meetups
          .filter(m => m.clubId === clubId && m.date >= now)
          .forEach(m => {
            if (excludeEventType === 'meetup' && m.id === excludeEventId) return;
            allEvents.push({
              id: m.id,
              name: m.title,
              type: 'meetup',
              date: m.date,
              status: m.status,
            });
          });

        // Sort by date and limit
        allEvents.sort((a, b) => a.date - b.date);
        setEvents(allEvents.slice(0, maxEvents));
      } catch (err) {
        console.error('Failed to fetch club events:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [clubId, excludeEventId, excludeEventType, maxEvents]);

  if (loading) {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-700 rounded w-1/3 mb-3"></div>
        <div className="space-y-2">
          <div className="h-12 bg-gray-700 rounded"></div>
          <div className="h-12 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'tournament': return 'bg-purple-500/20 text-purple-400';
      case 'league': return 'bg-blue-500/20 text-blue-400';
      case 'meetup': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getEventUrl = (event: EventItem) => {
    switch (event.type) {
      case 'tournament': return `/#/tournaments/${event.id}`;
      case 'league': return `/#/leagues/${event.id}`;
      case 'meetup': return `/#/meetups/${event.id}`;
      default: return '#';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
          More at this Venue
        </h4>
        <a
          href={`/#/clubs/${clubId}`}
          className="text-xs text-lime-400 hover:text-lime-300 transition-colors"
        >
          View All →
        </a>
      </div>

      <div className="space-y-2">
        {events.map((event) => (
          <a
            key={`${event.type}-${event.id}`}
            href={getEventUrl(event)}
            className="block p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {event.name}
                </div>
                <div className="text-xs text-gray-400">
                  {formatDate(event.date)}
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getTypeColor(event.type)}`}>
                {event.type}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default ClubEventsPreview;
