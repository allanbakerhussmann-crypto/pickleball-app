/**
 * LeaguesList Component
 * 
 * Browse and discover leagues
 * 
 * FILE LOCATION: components/leagues/LeaguesList.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToLeagues, getUserLeagues } from '../../services/firebase';
import type { League, LeagueType, LeagueStatus } from '../../types';

interface LeaguesListProps {
  onSelectLeague: (leagueId: string) => void;
  onCreateLeague: () => void;
}

export const LeaguesList: React.FC<LeaguesListProps> = ({
  onSelectLeague,
  onCreateLeague,
}) => {
  const { currentUser, isOrganizer } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'browse' | 'my'>('browse');
  const [typeFilter, setTypeFilter] = useState<LeagueType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<LeagueStatus | 'all'>('all');

  useEffect(() => {
    const unsubscribe = subscribeToLeagues((data) => {
      setLeagues(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      getUserLeagues(currentUser.uid).then(setMyLeagues);
    }
  }, [currentUser]);

  const filteredLeagues = leagues.filter(league => {
    if (typeFilter !== 'all' && league.type !== typeFilter) return false;
    if (statusFilter !== 'all' && league.status !== statusFilter) return false;
    return true;
  });

  const displayLeagues = activeTab === 'my' ? myLeagues : filteredLeagues;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: LeagueStatus) => {
    const styles: Record<LeagueStatus, string> = {
      draft: 'bg-gray-600 text-gray-200',
      registration: 'bg-blue-600 text-blue-100',
      active: 'bg-green-600 text-green-100',
      completed: 'bg-purple-600 text-purple-100',
      cancelled: 'bg-red-600 text-red-100',
    };
    const labels: Record<LeagueStatus, string> = {
      draft: 'Draft',
      registration: 'Open',
      active: 'Active',
      completed: 'Ended',
      cancelled: 'Cancelled',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getTypeBadge = (type: LeagueType) => {
    const styles: Record<LeagueType, string> = {
      singles: 'bg-green-900/50 text-green-400 border-green-700',
      doubles: 'bg-blue-900/50 text-blue-400 border-blue-700',
      team: 'bg-purple-900/50 text-purple-400 border-purple-700',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded border ${styles[type]}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getFormatLabel = (format: string) => {
    const labels: Record<string, string> = {
      ladder: '🪜 Ladder',
      round_robin: '🔄 Round Robin',
      swiss: '🎯 Swiss',
    };
    return labels[format] || format;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leagues</h1>
          <p className="text-sm text-gray-400">Ongoing competitive play with standings</p>
        </div>
        {isOrganizer && (
          <button
            onClick={onCreateLeague}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create League
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('browse')}
          className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'browse'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Browse Leagues
        </button>
        {currentUser && (
          <button
            onClick={() => setActiveTab('my')}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'my'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            My Leagues
            {myLeagues.length > 0 && (
              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                {myLeagues.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Filters (only for browse tab) */}
      {activeTab === 'browse' && (
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as LeagueType | 'all')}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
          >
            <option value="all">All Types</option>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
            <option value="team">Team</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LeagueStatus | 'all')}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
          >
            <option value="all">All Status</option>
            <option value="registration">Open for Registration</option>
            <option value="active">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && displayLeagues.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            {activeTab === 'my' ? 'No League Memberships' : 'No Leagues Found'}
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            {activeTab === 'my'
              ? "You haven't joined any leagues yet."
              : 'No leagues match your current filters.'}
          </p>
          {activeTab === 'my' && (
            <button
              onClick={() => setActiveTab('browse')}
              className="text-blue-400 hover:text-blue-300 font-semibold"
            >
              Browse available leagues →
            </button>
          )}
        </div>
      )}

      {/* Leagues List */}
      {!loading && displayLeagues.length > 0 && (
        <div className="space-y-4">
          {displayLeagues.map((league) => (
            <div
              key={league.id}
              onClick={() => onSelectLeague(league.id)}
              className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-blue-500/50 cursor-pointer transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                      {league.name}
                    </h3>
                    {getStatusBadge(league.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    {getTypeBadge(league.type)}
                    <span className="text-sm text-gray-500">
                      {getFormatLabel(league.format)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">{league.memberCount}</div>
                  <div className="text-xs text-gray-500">members</div>
                </div>
              </div>

              {league.description && (
                <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                  {league.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>
                    {formatDate(league.seasonStart)} - {formatDate(league.seasonEnd)}
                  </span>
                </div>

                {league.clubName && (
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                    </svg>
                    <span>{league.clubName}</span>
                  </div>
                )}

                {league.matchesPlayed > 0 && (
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>{league.matchesPlayed} matches</span>
                  </div>
                )}

                {league.location && (
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span>{league.location}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaguesList;