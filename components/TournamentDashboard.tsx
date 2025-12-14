
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
  const [viewType, setViewType] = useState<'list' | 'map'>('list');
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
    <div className="max-w-6xl mx-auto min-h-[80vh] px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
             <h1 className="text-2xl font-bold text-white">Tournaments</h1>
             <div className="flex gap-3">
                 {/* View Toggle */}
                 <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex">
                    <button 
                        onClick={() => setViewType('list')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewType === 'list' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        List
                    </button>
                    <button 
                        onClick={() => setViewType('map')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewType === 'map' ? 'bg-green-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                        Map
                    </button>
                 </div>

                 {isOrganizer && (
                     <button onClick={onCreateTournamentClick} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg transition-transform hover:scale-105 text-sm flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                         Create
                     </button>
                 )}
             </div>
        </div>
        
        <div className="flex gap-4 mb-6 border-b border-gray-800">
            <button onClick={() => setActiveTab('search')} className={`text-sm font-bold pb-3 px-2 ${activeTab === 'search' ? 'border-b-2 border-green-500 text-white' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-300'}`}>All Events</button>
            {isOrganizer && <button onClick={() => setActiveTab('managing')} className={`text-sm font-bold pb-3 px-2 ${activeTab === 'managing' ? 'border-b-2 border-green-500 text-white' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-300'}`}>Managing</button>}
        </div>

        {activeTab === 'search' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-2 relative">
                    <input 
                        className="w-full bg-gray-800 text-white p-3 pl-10 rounded-xl border border-gray-700 focus:border-green-500 focus:outline-none transition-colors"
                        placeholder="Search tournaments..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <svg className="w-5 h-5 text-gray-500 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <select 
                    className="bg-gray-800 text-white p-3 rounded-xl border border-gray-700 outline-none focus:border-green-500"
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

        {viewType === 'list' ? (
            <div className="grid gap-4 animate-fade-in-up">
                {displayedTournaments.length === 0 ? (
                    <div className="text-center text-gray-500 py-16 bg-gray-800/30 rounded-xl border border-gray-800 italic">
                        No tournaments found matching your criteria.
                    </div>
                ) : (
                    displayedTournaments.map(t => (
                        <div key={t.id} onClick={() => onSelectTournament(t.id)} className="bg-gray-800 p-5 rounded-xl border border-gray-700 hover:border-green-500 cursor-pointer flex flex-col sm:flex-row justify-between sm:items-center group transition-all hover:shadow-lg hover:shadow-green-900/10">
                            <div className="flex gap-4">
                                {/* Date Box */}
                                <div className="hidden sm:flex flex-col items-center justify-center bg-gray-900 rounded-lg p-3 w-16 h-16 border border-gray-700 group-hover:border-green-500/50 transition-colors">
                                    <span className="text-xs text-green-500 font-bold uppercase">{new Date(t.startDatetime).toLocaleString('default', { month: 'short' })}</span>
                                    <span className="text-xl text-white font-black">{new Date(t.startDatetime).getDate()}</span>
                                </div>
                                
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors">{t.name}</h3>
                                        {t.status === 'in_progress' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Live"></span>}
                                    </div>
                                    
                                    {t.clubName && (
                                        <div className="flex items-center gap-2 mb-1.5 text-xs text-gray-400">
                                            {t.clubLogoUrl && <img src={t.clubLogoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />}
                                            <span>Hosted by <span className="text-gray-300 font-semibold">{t.clubName}</span></span>
                                        </div>
                                    )}
                                    <div className="text-sm text-gray-500 flex items-center gap-2">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        <span>{t.venue}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-4 sm:mt-0 flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                                <span className="sm:hidden text-sm text-gray-400 font-medium">
                                    {new Date(t.startDatetime).toLocaleDateString()}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    t.status === 'completed' ? 'bg-gray-700 text-gray-400' :
                                    t.status === 'in_progress' ? 'bg-green-900/30 text-green-400 border border-green-900' :
                                    'bg-blue-900/30 text-blue-400 border border-blue-900'
                                }`}>{t.status.replace('_', ' ')}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        ) : (
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden h-[600px] relative animate-fade-in">
                {/* Simulated Map UI */}
                <div className="absolute inset-0 bg-[#242f3e] opacity-80" 
                     style={{ 
                         backgroundImage: 'radial-gradient(#374151 1px, transparent 1px)', 
                         backgroundSize: '20px 20px' 
                     }}>
                </div>
                
                {/* Simulated Pins */}
                {displayedTournaments.map((t, i) => {
                    // Generate deterministic "random" positions based on ID to keep them consistent but scattered
                    const pseudoRandomX = (t.id.charCodeAt(0) * 7 + t.id.charCodeAt(t.id.length - 1)) % 80 + 10; 
                    const pseudoRandomY = (t.id.charCodeAt(1) * 3 + t.id.charCodeAt(t.id.length - 2)) % 80 + 10;
                    
                    return (
                        <button 
                            key={t.id}
                            onClick={() => onSelectTournament(t.id)}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10 hover:z-20 transition-all duration-300"
                            style={{ top: `${pseudoRandomY}%`, left: `${pseudoRandomX}%` }}
                        >
                            <div className="relative">
                                {/* Pin */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-lg transition-transform group-hover:scale-125 ${
                                    t.status === 'in_progress' ? 'bg-green-600 border-white' : 'bg-gray-800 border-green-500'
                                }`}>
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.06 9.94a6.5 6.5 0 1 0 0 9.18 6.5 6.5 0 0 0 0-9.18ZM13 15.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" /><circle cx="12.5" cy="17.5" r="1.5" /></svg>
                                </div>
                                {/* Triangle arrow */}
                                <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] ${
                                    t.status === 'in_progress' ? 'border-t-green-600' : 'border-t-gray-800'
                                }`}></div>
                                
                                {/* Tooltip Card */}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-48 bg-white text-gray-900 rounded-lg p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <div className="text-xs font-bold line-clamp-1">{t.name}</div>
                                    <div className="text-[10px] text-gray-500">{t.venue}</div>
                                    <div className="text-[10px] font-semibold text-green-600 mt-1">{t.status.replace('_', ' ')}</div>
                                </div>
                            </div>
                        </button>
                    );
                })}

                <div className="absolute bottom-4 left-4 bg-gray-900/90 p-3 rounded-lg border border-gray-700 text-xs text-gray-300">
                    <p className="font-bold mb-1">Visual Map Demo</p>
                    <p>Locations are simulated for this preview.</p>
                </div>
            </div>
        )}
    </div>
  );
};
