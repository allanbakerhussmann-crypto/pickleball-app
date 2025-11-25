
import React, { useState, useMemo } from 'react';
import type { Tournament } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface TournamentDashboardProps {
  tournaments: Tournament[];
  onSelectTournament: (id: string) => void;
  onCreateTournamentClick: () => void;
  onlyMyEvents?: boolean;
  onBack?: () => void;
}

export const TournamentDashboard: React.FC<TournamentDashboardProps> = ({
  tournaments,
  onSelectTournament,
  onCreateTournamentClick,
  onlyMyEvents = false,
  onBack
}) => {
  const { isOrganizer, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'search' | 'managing'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [clubFilter, setClubFilter] = useState('all');

  // Extract unique clubs from available tournaments
  const availableClubs = useMemo(() => {
      const clubsMap = new Map<string, string>(); // id -> name
      tournaments.forEach(t => {
          if (t.clubId && t.clubName) {
              clubsMap.set(t.clubId, t.clubName);
          }
      });
      return Array.from(clubsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tournaments]);

  const displayedTournaments = useMemo(() => {
      let filtered = tournaments;

      if (activeTab === 'managing') {
          filtered = filtered.filter(t => t.createdByUserId === currentUser?.uid);
      } else {
          // Search Filter
          if (searchQuery) {
              filtered = filtered.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
          }
          // Club Filter
          if (clubFilter !== 'all') {
              filtered = filtered.filter(t => t.clubId === clubFilter);
          }
      }

      return filtered;
  }, [tournaments, activeTab, searchQuery, clubFilter, currentUser]);

  return (
    <div className="max-w-4xl mx-auto min-h-[80vh]">
        <div className="flex items-center justify-between mb-6">
             <h1 className="text-2xl font-bold text-white">Tournaments</h1>
             {isOrganizer && (
                 <button onClick={onCreateTournamentClick} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow-lg transition-transform hover:scale-105">Create New</button>
             )}
        </div>
        
        <div className="flex gap-4 mb-6">
            <button onClick={() => setActiveTab('search')} className={`text-sm font-bold pb-2 border-b-2 ${activeTab === 'search' ? 'border-green-500 text-white' : 'border-transparent text-gray-500'}`}>All Events</button>
            {isOrganizer && <button onClick={() => setActiveTab('managing')} className={`text-sm font-bold pb-2 border-b-2 ${activeTab === 'managing' ? 'border-green-500 text-white' : 'border-transparent text-gray-500'}`}>Managing</button>}
        </div>

        {activeTab === 'search' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input 
                    className="md:col-span-2 bg-gray-800 text-white p-3 rounded border border-gray-700"
                    placeholder="Search tournaments..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                <select 
                    className="bg-gray-800 text-white p-3 rounded border border-gray-700 outline-none"
                    value={clubFilter}
                    onChange={e => setClubFilter(e.target.value)}
                >
                    <option value="all">All Clubs</option>
                    {availableClubs.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
        )}

        <div className="grid gap-4">
            {displayedTournaments.length === 0 ? (
                <div className="text-center text-gray-500 py-10 italic">No tournaments found matching your criteria.</div>
            ) : (
                displayedTournaments.map(t => (
                    <div key={t.id} onClick={() => onSelectTournament(t.id)} className="bg-gray-800 p-4 rounded border border-gray-700 hover:border-green-500 cursor-pointer flex justify-between transition-colors group">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-green-400 transition-colors">{t.name}</h3>
                            {t.clubName && (
                                <div className="flex items-center gap-2 mb-1.5">
                                    {t.clubLogoUrl && <img src={t.clubLogoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />}
                                    <span className="text-xs font-bold text-green-400 uppercase tracking-wide">Hosted by {t.clubName}</span>
                                </div>
                            )}
                            <div className="text-sm text-gray-400 flex items-center gap-2">
                                <span>{t.venue}</span>
                                <span>•</span>
                                <span>{new Date(t.startDatetime).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end justify-center">
                            <span className={`px-2 py-1 rounded uppercase text-xs font-bold ${
                                t.status === 'completed' ? 'bg-gray-700 text-gray-400' :
                                t.status === 'in_progress' ? 'bg-green-900 text-green-400' :
                                'bg-blue-900 text-blue-300'
                            }`}>{t.status.replace('_', ' ')}</span>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );
};
