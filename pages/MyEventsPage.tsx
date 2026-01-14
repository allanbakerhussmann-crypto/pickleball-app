/**
 * MyEventsPage - View your registered events across all types
 *
 * V07.49: Add tabs for Tournaments | Leagues | Meetups
 *         - Tournaments tab shows TournamentDashboard
 *         - Leagues tab shows MyLeaguesTab with box/court/session info
 *         - Meetups tab shows placeholder for now
 *
 * FILE LOCATION: pages/MyEventsPage.tsx
 * VERSION: V07.49
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TournamentDashboard } from '../components/TournamentDashboard';
import { MyLeaguesTab } from '../components/myevents/MyLeaguesTab';
import { subscribeToTournaments } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES, getRoute } from '../router/routes';
import type { Tournament } from '../types';

type EventTab = 'tournaments' | 'leagues' | 'meetups';

const TAB_CONFIG: { id: EventTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'tournaments',
    label: 'Tournaments',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: 'leagues',
    label: 'Leagues',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'meetups',
    label: 'Meetups',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

const MyEventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, isOrganizer } = useAuth();
  const [activeTab, setActiveTab] = useState<EventTab>('tournaments');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    // subscribeToTournaments requires userId as first param
    const userId = currentUser?.uid || '';
    const unsubscribe = subscribeToTournaments(userId, (data) => {
      setTournaments(data);
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Count of events for each tab (shown as badges)
  // When using onlyMyEvents=true, subscribeToTournaments already filters to user's tournaments
  const tournamentCount = tournaments.length;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'tournaments':
        return (
          <TournamentDashboard
            tournaments={tournaments}
            onSelectTournament={(id) => navigate(getRoute.tournamentDetail(id))}
            onCreateTournamentClick={() => {
              if (isOrganizer) {
                navigate(ROUTES.TOURNAMENT_CREATE);
              }
            }}
            onlyMyEvents={true}
          />
        );

      case 'leagues':
        return <MyLeaguesTab />;

      case 'meetups':
        return (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-400 mb-2">Coming Soon</h3>
            <p className="text-sm text-gray-500 max-w-md">
              Your registered meetups and social play events will appear here.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(ROUTES.DASHBOARD)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold">My Events</h1>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 p-1 bg-gray-900 rounded-lg">
            {TAB_CONFIG.map((tab) => {
              const isActive = activeTab === tab.id;
              const count = tab.id === 'tournaments' ? tournamentCount : undefined;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gray-800 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      isActive ? 'bg-lime-500/20 text-lime-400' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default MyEventsPage;
