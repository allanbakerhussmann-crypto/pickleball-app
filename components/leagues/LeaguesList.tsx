/**
 * LeaguesList Component
 * 
 * Browse and discover leagues with filtering and search.
 * Updated for V05.17 with format filter, improved cards, mixed doubles support.
 * 
 * FILE LOCATION: components/leagues/LeaguesList.tsx
 * VERSION: V05.17
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToLeagues, getUserLeagues } from '../../services/firebase';
import type { League, LeagueType, LeagueFormat, LeagueStatus } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeaguesListProps {
  onSelectLeague: (leagueId: string) => void;
  onCreateLeague: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const LeaguesList: React.FC<LeaguesListProps> = ({
  onSelectLeague,
  onCreateLeague,
}) => {
  const { currentUser, isOrganizer } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'browse' | 'my'>('browse');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<LeagueType | 'all'>('all');
  const [formatFilter, setFormatFilter] = useState<LeagueFormat | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<LeagueStatus | 'all'>('all');

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    const unsubscribe = subscribeToLeagues((data) => {
      // Only show non-draft leagues to public
      const publicLeagues = data.filter(l => l.status !== 'draft' || l.createdByUserId === currentUser?.uid);
      setLeagues(publicLeagues);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (currentUser) {
      getUserLeagues(currentUser.uid).then(setMyLeagues);
    }
  }, [currentUser]);

  // ============================================
  // FILTERING
  // ============================================

  const filteredLeagues = leagues.filter(league => {
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        league.name.toLowerCase().includes(term) ||
        (league.description || '').toLowerCase().includes(term) ||
        (league.location || '').toLowerCase().includes(term) ||
        (league.clubName || '').toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }
    
    // Type filter
    if (typeFilter !== 'all' && league.type !== typeFilter) return false;
    
    // Format filter
    if (formatFilter !== 'all' && league.format !== formatFilter) return false;
    
    // Status filter
    if (statusFilter !== 'all' && league.status !== statusFilter) return false;
    
    return true;
  });

  const displayLeagues = activeTab === 'my' ? myLeagues : filteredLeagues;

  // Sort: active first, then registration, then by date
  const sortedLeagues = [...displayLeagues].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      active: 0,
      registration: 1,
      playoffs: 2,
      draft: 3,
      completed: 4,
      cancelled: 5,
    };
    const orderA = statusOrder[a.status] ?? 10;
    const orderB = statusOrder[b.status] ?? 10;
    if (orderA !== orderB) return orderA - orderB;
    return b.createdAt - a.createdAt;
  });

  // ============================================
  // HELPERS
  // ============================================

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: LeagueStatus) => {
    const styles: Record<LeagueStatus, string> = {
      draft: 'bg-gray-600 text-gray-200',
      registration: 'bg-blue-600 text-blue-100',
      active: 'bg-green-600 text-green-100',
      playoffs: 'bg-yellow-600 text-yellow-100',
      completed: 'bg-purple-600 text-purple-100',
      cancelled: 'bg-red-600 text-red-100',
    };
    const labels: Record<LeagueStatus, string> = {
      draft: 'Draft',
      registration: 'Open',
      active: 'Active',
      playoffs: 'Playoffs',
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
      mixed_doubles: 'bg-pink-900/50 text-pink-400 border-pink-700',
      team: 'bg-purple-900/50 text-purple-400 border-purple-700',
    };
    const labels: Record<LeagueType, string> = {
      singles: 'Singles',
      doubles: 'Doubles',
      mixed_doubles: 'Mixed',
      team: 'Team',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded border ${styles[type] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
        {labels[type] || type}
      </span>
    );
  };

  const getFormatIcon = (format: LeagueFormat) => {
    const icons: Record<LeagueFormat, string> = {
      ladder: '🪜',
      round_robin: '🔄',
      swiss: '🎯',
      box_league: '📦',
    };
    return icons[format] || '📋';
  };

  const getFormatLabel = (format: LeagueFormat) => {
    const labels: Record<LeagueFormat, string> = {
      ladder: 'Ladder',
      round_robin: 'Round Robin',
      swiss: 'Swiss',
      box_league: 'Box League',
    };
    return labels[format] || format;
  };

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setFormatFilter('all');
    setStatusFilter('all');
  };

  const hasActiveFilters = searchTerm || typeFilter !== 'all' || formatFilter !== 'all' || statusFilter !== 'all';

  // ============================================
  // RENDER
  // ============================================

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

      {/* Search & Filters (only for browse tab) */}
      {activeTab === 'browse' && (
        <div className="space-y-3 mb-6">
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search leagues..."
              className="w-full bg-gray-800 border border-gray-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as LeagueType | 'all')}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Types</option>
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
              <option value="mixed_doubles">Mixed Doubles</option>
              <option value="team">Team</option>
            </select>

            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value as LeagueFormat | 'all')}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Formats</option>
              <option value="ladder">🪜 Ladder</option>
              <option value="round_robin">🔄 Round Robin</option>
              <option value="swiss">🎯 Swiss</option>
              <option value="box_league">📦 Box League</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeagueStatus | 'all')}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="registration">Open for Registration</option>
              <option value="active">In Progress</option>
              <option value="completed">Completed</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-400 hover:text-white px-3 py-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && sortedLeagues.length === 0 && (
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
              : hasActiveFilters 
                ? 'No leagues match your current filters.'
                : 'No leagues available at the moment.'}
          </p>
          {activeTab === 'my' && (
            <button
              onClick={() => setActiveTab('browse')}
              className="text-blue-400 hover:text-blue-300 font-semibold"
            >
              Browse available leagues →
            </button>
          )}
          {activeTab === 'browse' && hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-blue-400 hover:text-blue-300 font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Results Count */}
      {!loading && sortedLeagues.length > 0 && activeTab === 'browse' && hasActiveFilters && (
        <div className="text-sm text-gray-400 mb-4">
          Showing {sortedLeagues.length} league{sortedLeagues.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Leagues List */}
      {!loading && sortedLeagues.length > 0 && (
        <div className="space-y-4">
          {sortedLeagues.map((league) => {
            const isMyLeague = myLeagues.some(l => l.id === league.id);
            const isDoublesOrMixed = league.type === 'doubles' || league.type === 'mixed_doubles';
            // Use optional chaining for registrationDeadline which may not exist on all leagues
            const regDeadline = (league as any).registrationDeadline;
            
            return (
              <div
                key={league.id}
                onClick={() => onSelectLeague(league.id)}
                className={`bg-gray-800 rounded-xl p-5 border cursor-pointer transition-all group ${
                  isMyLeague 
                    ? 'border-blue-500/50 hover:border-blue-500' 
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Top Row: Title + Status */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors truncate">
                        {league.name}
                      </h3>
                      {getStatusBadge(league.status)}
                      {isMyLeague && activeTab === 'browse' && (
                        <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded">
                          Joined
                        </span>
                      )}
                    </div>
                    
                    {/* Type + Format Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getTypeBadge(league.type)}
                      <span className="text-sm text-gray-500">
                        {getFormatIcon(league.format)} {getFormatLabel(league.format)}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Member Count */}
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-2xl font-bold text-white">
                      {league.memberCount || 0}
                    </div>
                    <div className="text-xs text-gray-500">
                      {isDoublesOrMixed ? 'teams' : 'players'}
                    </div>
                  </div>
                </div>

                {/* Description (truncated) */}
                {league.description && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {league.description}
                  </p>
                )}

                {/* Bottom Info Row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                  <span>
                    📅 {formatDate(league.seasonStart)} - {formatDate(league.seasonEnd)}
                  </span>
                  {league.location && (
                    <span>📍 {league.location}</span>
                  )}
                  {league.clubName && (
                    <span>🏢 {league.clubName}</span>
                  )}
                  {league.pricing?.enabled && (
                    <span className="text-green-400">
                      💰 ${(league.pricing.entryFee / 100).toFixed(0)}
                    </span>
                  )}
                  {!league.pricing?.enabled && (
                    <span className="text-green-400">Free</span>
                  )}
                </div>

                {/* Registration Deadline Warning */}
                {league.status === 'registration' && regDeadline && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    {regDeadline > Date.now() ? (
                      <span className="text-xs text-yellow-400">
                        ⏰ Registration closes {formatDate(regDeadline)}
                      </span>
                    ) : (
                      <span className="text-xs text-red-400">
                        Registration closed
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaguesList;