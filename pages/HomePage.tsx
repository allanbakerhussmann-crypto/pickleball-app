/**
 * HomePage - Main Landing Page with 3 Sections
 * 
 * Shows upcoming Meetups, Leagues, and Tournaments
 * 
 * FILE LOCATION: pages/HomePage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMeetups, subscribeToTournaments } from '../services/firebase';
import { ROUTES, getRoute } from '../router/routes';
import type { Meetup, Tournament } from '../types';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, isOrganizer } = useAuth();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load meetups
        const meetupsData = await getMeetups();
        const now = Date.now();
        const upcomingMeetups = meetupsData
          .filter(m => m.when >= now && m.status !== 'cancelled')
          .slice(0, 4);
        setMeetups(upcomingMeetups);
      } catch (e) {
        console.error('Error loading meetups:', e);
      }
      setLoading(false);
    };

    loadData();

    // Subscribe to tournaments
    const userId = currentUser?.uid || '';
    const unsubscribe = subscribeToTournaments(userId, (data) => {
      const now = Date.now();
      const upcoming = data
        .filter(t => new Date(t.startDate).getTime() >= now - 86400000)
        .slice(0, 4);
      setTournaments(upcoming);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Icon components for cleaner JSX
  const CalendarIcon = () => (
    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  const LocationIcon = () => (
    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const ChevronRightIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  const PlusIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-8">
      {/* Welcome Header */}
      <div className="text-center py-6">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
          Welcome to <span className="text-green-400">PickleballDirector</span>
        </h1>
        <p className="text-gray-400">Find games, join leagues, and compete in tournaments</p>
      </div>

      {/* ==================== MEETUPS SECTION ==================== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Social Meetups</h2>
              <p className="text-sm text-gray-400">Casual games near you</p>
            </div>
          </div>
          <button
            onClick={() => navigate(ROUTES.MEETUPS)}
            className="text-green-400 hover:text-green-300 text-sm font-semibold flex items-center gap-1"
          >
            View All
            <ChevronRightIcon />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : meetups.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <p className="text-gray-400 mb-4">No upcoming meetups</p>
            <button
              onClick={() => navigate(ROUTES.MEETUP_CREATE)}
              className="text-green-400 hover:text-green-300 font-semibold"
            >
              + Create the first one
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {meetups.map(meetup => (
              <div
                key={meetup.id}
                onClick={() => navigate(getRoute.meetupDetail(meetup.id))}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-green-500/50 cursor-pointer transition-all group"
              >
                <h3 className="font-bold text-white group-hover:text-green-400 transition-colors mb-2 truncate">
                  {meetup.title}
                </h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <CalendarIcon />
                    <span>{formatDate(meetup.when)} • {formatTime(meetup.when)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <LocationIcon />
                    <span className="truncate">{meetup.locationName}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==================== LEAGUES SECTION ==================== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Leagues</h2>
              <p className="text-sm text-gray-400">Ongoing competitive play</p>
            </div>
          </div>
          <button
            onClick={() => navigate(ROUTES.LEAGUES)}
            className="text-blue-400 hover:text-blue-300 text-sm font-semibold flex items-center gap-1"
          >
            View All
            <ChevronRightIcon />
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Leagues Coming Soon</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Recurring weekly play with standings, ratings, and season championships. 
            Join the waitlist to be notified when leagues launch.
          </p>
          <button className="mt-4 px-6 py-2 bg-blue-600/20 text-blue-400 rounded-lg font-semibold hover:bg-blue-600/30 transition-colors">
            Notify Me
          </button>
        </div>
      </section>

      {/* ==================== TOURNAMENTS SECTION ==================== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Tournaments</h2>
              <p className="text-sm text-gray-400">Competitive bracket events</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isOrganizer && (
              <button
                onClick={() => navigate(ROUTES.TOURNAMENT_CREATE)}
                className="text-purple-400 hover:text-purple-300 text-sm font-semibold"
              >
                + Create
              </button>
            )}
            <button
              onClick={() => navigate(ROUTES.TOURNAMENTS)}
              className="text-purple-400 hover:text-purple-300 text-sm font-semibold flex items-center gap-1"
            >
              View All
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        {tournaments.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <p className="text-gray-400 mb-4">No upcoming tournaments</p>
            {isOrganizer && (
              <button
                onClick={() => navigate(ROUTES.TOURNAMENT_CREATE)}
                className="text-purple-400 hover:text-purple-300 font-semibold"
              >
                + Create a tournament
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tournaments.map(tournament => (
              <div
                key={tournament.id}
                onClick={() => navigate(getRoute.tournamentDetail(tournament.id))}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-purple-500/50 cursor-pointer transition-all group"
              >
                <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors mb-2 truncate">
                  {tournament.name}
                </h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{new Date(tournament.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  {tournament.clubName && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="truncate">{tournament.clubName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{tournament.divisions?.length || 0} divisions</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions for logged in users */}
      {currentUser && (
        <section className="pt-4">
          <div className="bg-gradient-to-r from-gray-800 to-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate(ROUTES.MEETUP_CREATE)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors"
              >
                <PlusIcon />
                Host a Meetup
              </button>
              <button
                onClick={() => navigate(ROUTES.CLUBS)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
                Browse Clubs
              </button>
              <button
                onClick={() => navigate(ROUTES.PLAYERS)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Players
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default HomePage;