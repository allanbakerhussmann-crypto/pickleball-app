/**
 * MyLeaguesTab - Shows leagues where the user is enrolled
 *
 * Displays league schedule cards with box, court, session info
 * and upcoming matches for each league.
 *
 * V07.49: Initial implementation
 *
 * FILE LOCATION: components/myevents/MyLeaguesTab.tsx
 * VERSION: V07.49
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getUserLeagues } from '../../services/firebase/leagues';
import { LeagueScheduleCard } from './LeagueScheduleCard';
import { getRoute } from '../../router/routes';
import type { League } from '../../types';

export const MyLeaguesTab: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeagues = async () => {
      if (!currentUser?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        const userLeagues = await getUserLeagues(currentUser.uid);
        // Sort by status (active first) then by name
        const sorted = userLeagues.sort((a, b) => {
          const statusOrder: Record<string, number> = { active: 0, playoffs: 1, registration: 2 };
          const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
          if (statusDiff !== 0) return statusDiff;
          return a.name.localeCompare(b.name);
        });
        setLeagues(sorted);
      } catch (err) {
        console.error('Failed to fetch user leagues:', err);
        setError('Failed to load your leagues');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeagues();
  }, [currentUser?.uid]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-2 border-lime-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-400 mb-2">Error Loading Leagues</h3>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  // Empty state
  if (leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-400 mb-2">No Leagues Yet</h3>
        <p className="text-sm text-gray-500 max-w-md mb-6">
          You haven't joined any leagues yet. Browse available leagues to get started.
        </p>
        <button
          onClick={() => navigate(getRoute.leaguesList())}
          className="px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white rounded-lg font-medium transition-colors"
        >
          Browse Leagues
        </button>
      </div>
    );
  }

  // Leagues list
  return (
    <div className="p-4 space-y-4">
      {leagues.map(league => (
        <LeagueScheduleCard
          key={league.id}
          league={league}
          onClick={() => navigate(getRoute.leagueDetail(league.id))}
        />
      ))}
    </div>
  );
};

export default MyLeaguesTab;
