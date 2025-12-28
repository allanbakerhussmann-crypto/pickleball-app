
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
      (tournaments || []).forEach(t => {
          if (t.clubId && t.clubName) {
              clubsMap.set(t.clubId, t.clubName);
          }
      });
      return Array.from(clubsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tournaments]);

  const displayedTournaments = useMemo(() => {
      let filtered = tournaments || [];

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
             <h1 className="text-2xl font-bold text-white tracking-tight">
                 {onlyMyEvents ? 'My Events' : 'Explore Tournaments'}
             </h1>
             {isOrganizer && !onlyMyEvents && (
                 <button onClick={onCreateTournamentClick} className="bg-white text-gray-900 hover:bg-gray-100 px-4 py-2 rounded-full font-bold shadow-lg transition-transform active:scale-95 text-sm flex items-center gap-2">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                     Create
                 </button>
             )}
        </div>
        
        {!onlyMyEvents && (
            <div className="flex gap-4 mb-6 border-b border-gray-800">
                <button onClick={() => setActiveTab('search')} className={`text-sm font-bold pb-3 border-b-2 transition-colors ${activeTab === 'search' ? 'border-green-500 text-white' : 'border-transparent text-gray-500'}`}>All Events</button>
                {isOrganizer && <button onClick={() => setActiveTab('managing')} className={`text-sm font-bold pb-3 border-b-2 transition-colors ${activeTab === 'managing' ? 'border-green-500 text-white' : 'border-transparent text-gray-500'}`}>Managing</button>}
            </div>
        )}

        {activeTab === 'search' && !onlyMyEvents && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <div className="md:col-span-2 relative">
                    <input 
                        className="w-full bg-gray-800 text-white pl-10 pr-4 py-3 rounded-xl border border-gray-700 focus:border-green-500 focus:outline-none"
                        placeholder="Search tournaments..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <svg className="w-5 h-5 text-gray-500 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <select 
                    className="bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-green-500 outline-none appearance-none"
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

        <div className="space-y-4">
            {displayedTournaments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-gray-800/30 rounded-2xl border border-dashed border-gray-700">
                    <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <p className="text-lg font-medium">No tournaments found.</p>
                </div>
            ) : (
                displayedTournaments.map(t => (
                    <div 
                        key={t.id} 
                        onClick={() => onSelectTournament(t.id)} 
                        className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 hover:border-gray-500 transition-all cursor-pointer group shadow-lg relative"
                    >
                        {/* Status Badge */}
                        <div className="absolute top-3 right-3 z-10">
                             <span className={`px-2.5 py-1 rounded-md uppercase text-[10px] font-bold tracking-wider shadow-sm backdrop-blur-md ${
                                t.status === 'draft' ? 'bg-blue-600 text-white' :
                                t.status === 'published' ? 'bg-purple-600 text-white' :
                                t.status === 'registration_open' ? 'bg-green-500 text-white' :
                                t.status === 'registration_closed' ? 'bg-yellow-500 text-black' :
                                t.status === 'in_progress' ? 'bg-orange-500 text-white' :
                                t.status === 'completed' ? 'bg-gray-600 text-gray-300' :
                                t.status === 'cancelled' ? 'bg-red-600 text-white' :
                                'bg-gray-500 text-white'
                            }`}>
                                {t.status.replace('_', ' ')}
                            </span>
                        </div>

                        {/* Image Header Area */}
                        <div className="h-32 w-full bg-gray-700 relative">
                            {t.bannerUrl ? (
                                <img src={t.bannerUrl} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-r from-gray-800 to-gray-700 flex items-center justify-center">
                                    <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-90"></div>
                            
                            {/* Title overlay on mobile / bottom of image */}
                            <div className="absolute bottom-0 left-0 p-4 w-full">
                                <h3 className="text-xl font-bold text-white leading-tight shadow-black drop-shadow-md">{t.name}</h3>
                            </div>
                        </div>

                        {/* Details Body */}
                        <div className="p-4 pt-2 relative">
                            {t.clubName && (
                                <div className="flex items-center gap-2 mb-3">
                                    {t.clubLogoUrl ? (
                                        <img src={t.clubLogoUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-gray-600" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-[8px] font-bold text-white">
                                            {t.clubName.charAt(0)}
                                        </div>
                                    )}
                                    <span className="text-xs font-bold text-green-400 uppercase tracking-wide truncate">{t.clubName}</span>
                                </div>
                            )}
                            
                            <div className="flex flex-wrap gap-y-2 text-sm text-gray-400">
                                <div className="flex items-center gap-1.5 mr-6">
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span>{new Date(t.startDatetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <span className="truncate max-w-[150px]">{t.venue}</span>
                                </div>
                            </div>
                            
                            {/* Colorful bottom accent strip */}
                            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${
                                t.status === 'draft' ? 'from-blue-500 to-blue-600' :
                                t.status === 'published' ? 'from-purple-500 to-purple-600' :
                                t.status === 'registration_open' ? 'from-green-500 to-emerald-600' :
                                t.status === 'registration_closed' ? 'from-yellow-500 to-yellow-600' :
                                t.status === 'in_progress' ? 'from-orange-500 to-orange-600' :
                                t.status === 'completed' ? 'from-gray-600 to-gray-700' :
                                t.status === 'cancelled' ? 'from-red-500 to-red-600' :
                                'from-gray-500 to-gray-600'
                            }`}></div>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );
};
