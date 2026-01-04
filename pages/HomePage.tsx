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
import { getMeetups, subscribeToTournaments, subscribeToLeagues, getAllClubs } from '../services/firebase';
import { ROUTES, getRoute } from '../router/routes';
import type { Meetup, Tournament, League, Club } from '../types';
import { formatTimestamp } from '../utils/timeFormat';
import { useLiveMatches } from '../hooks/useLiveMatches';
import { LiveNowSection } from '../components/home/LiveNowSection';

// Chevron icon component
const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, isOrganizer } = useAuth();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  // Live matches feed
  const { matches: liveMatches, loading: liveLoading, totalCount: liveTotalCount } = useLiveMatches();

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

      try {
        // Load clubs
        const clubsData = await getAllClubs();
        // Show active clubs, sorted by member count
        const activeClubs = clubsData
          .filter(c => c.status !== 'inactive')
          .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
          .slice(0, 4);
        setClubs(activeClubs);
      } catch (e) {
        console.error('Error loading clubs:', e);
      }

      setLoading(false);
    };

    loadData();

    // Subscribe to tournaments
    const userId = currentUser?.uid || '';
    const unsubTournaments = subscribeToTournaments(userId, (data) => {
      // Show all tournaments, or filter to upcoming if preferred
      const upcoming = data
        .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
        .slice(0, 4);
      setTournaments(upcoming);
    });

    // Subscribe to leagues
    const unsubLeagues = subscribeToLeagues((data) => {
      // Show active and registration open leagues
      const activeLeagues = data
        .filter(l => l.status === 'active' || l.status === 'registration')
        .slice(0, 4);
      setLeagues(activeLeagues);
    });

    return () => {
      unsubTournaments();
      unsubLeagues();
    };
  }, [currentUser]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Use formatTimestamp from utils/timeFormat
  const formatTime = formatTimestamp;

  const formatTournamentDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-8">
      {/* Welcome Header */}
      <div className="text-center py-6">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
          Welcome to <span className="text-green-400">PickleballDirector</span>
        </h1>
        <p className="text-gray-400">Find games, join leagues, and compete in tournaments</p>
      </div>

      {/* ==================== LIVE NOW SECTION ==================== */}
      <LiveNowSection
        matches={liveMatches}
        totalCount={liveTotalCount}
        loading={liveLoading}
      />

      {/* ==================== CLUBS SECTION ==================== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Clubs</h2>
              <p className="text-sm text-gray-400">Find a club near you</p>
            </div>
          </div>
          <button
            onClick={() => navigate(ROUTES.CLUBS)}
            className="text-orange-400 hover:text-orange-300 text-sm font-semibold flex items-center gap-1"
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
        ) : clubs.length === 0 ? (
          <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700">
            <p className="text-gray-400">No clubs available</p>
            {isOrganizer && (
              <button
                onClick={() => navigate(ROUTES.CLUBS)}
                className="mt-3 text-orange-400 hover:text-orange-300 text-sm font-semibold"
              >
                Create a Club →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {clubs.map(club => (
              <button
                key={club.id}
                onClick={() => navigate(getRoute.clubDetail(club.id))}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-orange-600 transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-white truncate">{club.name}</h3>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{club.memberCount || 0} members</span>
                  </div>
                  {club.courtCount && club.courtCount > 0 && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <span>{club.courtCount} courts</span>
                    </div>
                  )}
                  {club.location && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{club.location}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

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
          <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700">
            <p className="text-gray-400">No upcoming meetups</p>
            {currentUser && (
              <button
                onClick={() => navigate(ROUTES.MEETUP_CREATE)}
                className="mt-3 text-green-400 hover:text-green-300 text-sm font-semibold"
              >
                Create a Meetup →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {meetups.map(meetup => (
              <button
                key={meetup.id}
                onClick={() => navigate(getRoute.meetupDetail(meetup.id))}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-green-600 transition-colors text-left"
              >
                <h3 className="font-bold text-white mb-2 truncate">{meetup.title}</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatDate(meetup.when)} • {formatTime(meetup.when)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">
                      {typeof meetup.location === 'string' 
                        ? meetup.location 
                        : meetup.locationName || 'Location set'}
                    </span>
                  </div>
                </div>
              </button>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
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
        ) : leagues.length === 0 ? (
          <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700">
            <p className="text-gray-400">No active leagues</p>
            {isOrganizer && (
              <button
                onClick={() => navigate(ROUTES.LEAGUES)}
                className="mt-3 text-blue-400 hover:text-blue-300 text-sm font-semibold"
              >
                Create a League →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {leagues.map(league => (
              <button
                key={league.id}
                onClick={() => navigate(getRoute.leagueDetail(league.id))}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-600 transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-white truncate">{league.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    league.status === 'active' 
                      ? 'bg-green-900/50 text-green-400' 
                      : 'bg-blue-900/50 text-blue-400'
                  }`}>
                    {league.status === 'active' ? 'Active' : 'Open'}
                  </span>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{league.memberCount || 0} members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="capitalize text-gray-500">{league.type} • {league.format}</span>
                  </div>
                  {league.location && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span className="truncate">{league.location}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
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
          <button
            onClick={() => navigate(ROUTES.TOURNAMENTS)}
            className="text-purple-400 hover:text-purple-300 text-sm font-semibold flex items-center gap-1"
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
        ) : tournaments.length === 0 ? (
          <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700">
            <p className="text-gray-400">No upcoming tournaments</p>
            {isOrganizer && (
              <button
                onClick={() => navigate(ROUTES.TOURNAMENT_CREATE)}
                className="mt-3 text-purple-400 hover:text-purple-300 text-sm font-semibold"
              >
                Create a Tournament →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tournaments.map(tournament => (
              <button
                key={tournament.id}
                onClick={() => navigate(getRoute.tournamentDetail(tournament.id))}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-purple-600 transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-white truncate">{tournament.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    tournament.status === 'published' 
                      ? 'bg-green-900/50 text-green-400' 
                      : tournament.status === 'active'
                      ? 'bg-blue-900/50 text-blue-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {tournament.status === 'published' ? 'Open' : tournament.status}
                  </span>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatTournamentDate(tournament.startDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{tournament.venue}</span>
                  </div>
                  {tournament.clubName && (
                    <div className="text-xs text-gray-500 truncate">
                      by {tournament.clubName}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions for Logged Out Users */}
      {!currentUser && (
        <section className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-xl p-6 border border-gray-700 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Play?</h2>
          <p className="text-gray-400 mb-4">Sign in to join meetups, leagues, and tournaments</p>
          <button
            onClick={() => navigate('/?login=1')}
            className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold"
          >
            Get Started
          </button>
        </section>
      )}
    </div>
  );
};

export default HomePage;