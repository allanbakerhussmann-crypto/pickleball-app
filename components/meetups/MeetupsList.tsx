import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getMeetups, getPublicStandingMeetups } from '../../services/firebase';
import { MeetupsMap } from './MeetupsMap';
import { formatTime } from '../../utils/timeFormat';
import { getRoute } from '../../router/routes';
import type { Meetup } from '../../types';
import type { StandingMeetup } from '../../types/standingMeetup';

interface MeetupsListProps {
  onCreateClick: () => void;
  onSelectMeetup: (id: string) => void;
}

export const MeetupsList: React.FC<MeetupsListProps> = ({ onCreateClick, onSelectMeetup }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [weeklyMeetups, setWeeklyMeetups] = useState<StandingMeetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const loadMeetups = useCallback(async () => {
    setLoading(true);

    // Load both social meetups and weekly meetups in parallel
    const [socialData, weeklyData] = await Promise.all([
      getMeetups(),
      getPublicStandingMeetups({ limit: 10 })
    ]);

    const now = Date.now();
    // Keep past events for 3 days (72 hours)
    const cutoff = now - (3 * 24 * 60 * 60 * 1000);
    const upcoming = socialData.filter(m => m.when >= cutoff);
    setMeetups(upcoming);
    setWeeklyMeetups(weeklyData);
    setLoading(false);
  }, []);

  // Reload meetups when navigating to this page (location.key changes on navigation)
  useEffect(() => {
    loadMeetups();
  }, [location.key, loadMeetups]);

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
        Loading meetups...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Meetups</h1>
          <p className="text-gray-400 text-sm">Find weekly sessions and casual games near you.</p>
        </div>
        <button
          onClick={onCreateClick}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
        >
          <span className="text-xl leading-none">+</span> Create Meetup
        </button>
      </div>

      {/* Weekly Meetups Section */}
      {weeklyMeetups.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-white">Weekly Meetups</h2>
            <span className="bg-lime-600 text-white text-xs px-2 py-0.5 rounded font-bold">NEW</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {weeklyMeetups.map(meetup => {
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              const dayName = dayNames[meetup.recurrence.dayOfWeek];
              // Use perSessionAmount for per-week display, fallback to amount if not set
              const weeklyPrice = meetup.billing.perSessionAmount || meetup.billing.amount;
              const priceDisplay = weeklyPrice > 0
                ? `$${(weeklyPrice / 100).toFixed(0)} / week`
                : 'Free';

              return (
                <div
                  key={meetup.id}
                  onClick={() => navigate(`${getRoute.clubDetail(meetup.clubId)}?tab=standingMeetups`)}
                  className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-lg hover:border-lime-600/50 cursor-pointer transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 bg-lime-600/20 text-lime-400 text-[10px] px-2 py-1 rounded-bl uppercase font-bold">
                    Weekly
                  </div>

                  <h3 className="font-bold text-lg mb-1 text-white group-hover:text-lime-400 transition-colors">
                    {meetup.title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{meetup.clubName}</p>

                  <div className="text-sm text-gray-400 mb-4 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{dayName}s • {formatTime(meetup.recurrence.startTime)} - {formatTime(meetup.recurrence.endTime)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{meetup.locationName}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-700 pt-3">
                    <span>{meetup.subscriberCount || 0} members • {meetup.maxPlayers} spots</span>
                    <span className="text-lime-400 font-bold">{priceDisplay}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Social Meetups Section */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-white">Social Meetups</h2>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewMode('list')}
          className={'px-4 py-2 rounded-lg font-medium transition-colors ' +
            (viewMode === 'list'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white')
          }
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List
          </span>
        </button>
        <button
          onClick={() => setViewMode('map')}
          className={'px-4 py-2 rounded-lg font-medium transition-colors ' +
            (viewMode === 'map'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white')
          }
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Map
          </span>
        </button>
      </div>

      {meetups.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-10 text-center border border-gray-700">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-400 mb-4">No upcoming meetups found.</p>
          <button onClick={onCreateClick} className="text-green-400 hover:underline">
            Be the first to host one!
          </button>
        </div>
      ) : viewMode === 'map' ? (
        <MeetupsMap meetups={meetups} onSelectMeetup={onSelectMeetup} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {meetups.map(meetup => {
            const date = new Date(meetup.when);
            const isCreator = currentUser?.uid === meetup.createdByUserId;
            const isLinkOnly = meetup.visibility === 'linkOnly';
            const isCancelled = meetup.status === 'cancelled';
            const isPast = meetup.when < Date.now();

            return (
              <div
                key={meetup.id}
                onClick={() => onSelectMeetup(meetup.id)}
                className={'bg-gray-800 rounded-xl p-5 border shadow-lg hover:border-gray-500 cursor-pointer transition-all group relative overflow-hidden ' +
                  (isCancelled ? 'border-red-800 opacity-60' : 'border-gray-700')
                }
              >
                {isLinkOnly && (
                  <div className="absolute top-0 right-0 bg-yellow-900/80 text-yellow-200 text-[10px] px-2 py-1 rounded-bl uppercase font-bold">
                    Link Only
                  </div>
                )}

                {isCancelled && (
                  <div className="absolute top-0 right-0 bg-red-900/80 text-red-200 text-[10px] px-2 py-1 rounded-bl uppercase font-bold">
                    Cancelled
                  </div>
                )}

                <h3 className={'font-bold text-lg mb-1 group-hover:text-green-400 transition-colors ' +
                  (isCancelled ? 'text-gray-500 line-through' : 'text-white')
                }>
                  {meetup.title}
                </h3>
                
                <div className="text-sm text-gray-400 mb-4 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isPast && !isCancelled && (
                      <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">Ended</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{meetup.locationName}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-700 pt-3">
                  <span>Max: {meetup.maxPlayers > 0 ? meetup.maxPlayers : 'Unlimited'} players</span>
                  {isCreator && <span className="text-green-500 font-bold">Host</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};