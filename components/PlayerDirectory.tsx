/**
 * PlayerDirectory Component
 * 
 * Browse and search players with profile cards
 * 
 * FILE LOCATION: components/PlayerDirectory.tsx
 */

import React, { useEffect, useState } from 'react';
import { getAllUsers, searchUsers } from '../services/firebase';
import type { UserProfile } from '../types';

interface PlayerDirectoryProps {
  onBack: () => void;
}

export const PlayerDirectory: React.FC<PlayerDirectoryProps> = ({ onBack }) => {
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'region'>('name');

  useEffect(() => {
    getAllUsers(500).then((data) => {
      setPlayers(data);
      setFilteredPlayers(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPlayers(players);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = players.filter(p => {
      const name = (p.displayName || '').toLowerCase();
      const email = (p.email || '').toLowerCase();
      const region = (p.region || '').toLowerCase();
      return name.includes(term) || email.includes(term) || region.includes(term);
    });
    setFilteredPlayers(filtered);
  }, [searchTerm, players]);

  // Sort players
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.displayName || '').localeCompare(b.displayName || '');
    }
    if (sortBy === 'rating') {
      const ratingA = a.duprDoublesRating || a.ratingDoubles || 0;
      const ratingB = b.duprDoublesRating || b.ratingDoubles || 0;
      return ratingB - ratingA;
    }
    if (sortBy === 'region') {
      return (a.region || 'zzz').localeCompare(b.region || 'zzz');
    }
    return 0;
  });

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getRatingDisplay = (player: UserProfile) => {
    const doubles = player.duprDoublesRating || player.ratingDoubles;
    const singles = player.duprSinglesRating || player.ratingSingles;
    
    if (doubles || singles) {
      return (
        <div className="flex gap-2 text-xs">
          {doubles && (
            <span className="bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded">
              D: {doubles.toFixed(2)}
            </span>
          )}
          {singles && (
            <span className="bg-green-900/50 text-green-400 px-2 py-0.5 rounded">
              S: {singles.toFixed(2)}
            </span>
          )}
        </div>
      );
    }
    return <span className="text-xs text-gray-500">No rating</span>;
  };

  const getRoleBadge = (roles: string[]) => {
    if (roles?.includes('admin')) {
      return <span className="bg-red-900/50 text-red-400 text-xs px-2 py-0.5 rounded">Admin</span>;
    }
    if (roles?.includes('organizer')) {
      return <span className="bg-purple-900/50 text-purple-400 text-xs px-2 py-0.5 rounded">Organizer</span>;
    }
    return null;
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">Player Directory</h1>
          <p className="text-sm text-gray-400">
            {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <svg
            className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
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
            placeholder="Search by name, email, or region..."
            className="w-full bg-gray-800 text-white pl-10 pr-4 py-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'rating' | 'region')}
          className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        >
          <option value="name">Sort by Name</option>
          <option value="rating">Sort by Rating</option>
          <option value="region">Sort by Region</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && sortedPlayers.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Players Found</h3>
          <p className="text-gray-400 text-sm">
            {searchTerm ? 'Try a different search term' : 'No players have registered yet'}
          </p>
        </div>
      )}

      {/* Player Grid */}
      {!loading && sortedPlayers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedPlayers.map((player) => (
            <div
              key={player.id}
              onClick={() => setSelectedPlayer(player)}
              className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500/50 cursor-pointer transition-all group"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {player.photoData || player.photoURL ? (
                    <img
                      src={player.photoData || player.photoURL}
                      alt={player.displayName}
                      className="w-12 h-12 rounded-full object-cover border-2 border-gray-700 group-hover:border-blue-500"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold border-2 border-gray-700 group-hover:border-blue-500">
                      {getInitials(player.displayName || '')}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                      {player.displayName || 'Unknown Player'}
                    </h3>
                    {getRoleBadge(player.roles || [])}
                  </div>
                  
                  {player.region && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span>{player.region}</span>
                      {player.country && <span>, {player.country}</span>}
                    </div>
                  )}

                  {getRatingDisplay(player)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div
            className="bg-gray-800 rounded-xl max-w-md w-full border border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div className="h-24 bg-gradient-to-br from-blue-600 to-purple-600 relative">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-3 right-3 w-8 h-8 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Avatar overlapping header */}
            <div className="relative px-6">
              <div className="-mt-12 mb-4">
                {selectedPlayer.photoData || selectedPlayer.photoURL ? (
                  <img
                    src={selectedPlayer.photoData || selectedPlayer.photoURL}
                    alt={selectedPlayer.displayName}
                    className="w-24 h-24 rounded-full object-cover border-4 border-gray-800"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-gray-800">
                    {getInitials(selectedPlayer.displayName || '')}
                  </div>
                )}
              </div>

              {/* Name & Role */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-white">
                    {selectedPlayer.displayName || 'Unknown Player'}
                  </h2>
                  {getRoleBadge(selectedPlayer.roles || [])}
                </div>
                {selectedPlayer.email && (
                  <p className="text-gray-400 text-sm">{selectedPlayer.email}</p>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Doubles Rating</div>
                  <div className="text-lg font-bold text-blue-400">
                    {selectedPlayer.duprDoublesRating?.toFixed(2) || 
                     selectedPlayer.ratingDoubles?.toFixed(2) || 
                     '—'}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Singles Rating</div>
                  <div className="text-lg font-bold text-green-400">
                    {selectedPlayer.duprSinglesRating?.toFixed(2) || 
                     selectedPlayer.ratingSingles?.toFixed(2) || 
                     '—'}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 pb-6">
                {selectedPlayer.region && (
                  <div className="flex items-center gap-3 text-sm">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span className="text-gray-300">
                      {selectedPlayer.region}
                      {selectedPlayer.country && `, ${selectedPlayer.country}`}
                    </span>
                  </div>
                )}

                {selectedPlayer.gender && (
                  <div className="flex items-center gap-3 text-sm">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-gray-300 capitalize">{selectedPlayer.gender}</span>
                  </div>
                )}

                {selectedPlayer.playsHand && (
                  <div className="flex items-center gap-3 text-sm">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                    </svg>
                    <span className="text-gray-300 capitalize">{selectedPlayer.playsHand}-handed</span>
                  </div>
                )}

                {selectedPlayer.duprId && (
                  <div className="flex items-center gap-3 text-sm">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-300">DUPR ID: {selectedPlayer.duprId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerDirectory;