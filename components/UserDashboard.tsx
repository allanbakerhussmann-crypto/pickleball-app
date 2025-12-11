
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { fetchDuprRatings } from '../services/duprService';

interface UserDashboardProps {
  userProfile: UserProfile;
  onEditProfile: () => void;
  onNavigate: (view: string) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ userProfile, onEditProfile, onNavigate }) => {
  const { updateUserExtendedProfile } = useAuth();
  const [isSyncingDupr, setIsSyncingDupr] = useState(false);

  // Helper to calculate age from birthDate string (YYYY-MM-DD)
  const getAge = (birthDate?: string) => {
    if (!birthDate) return '--';
    const today = new Date();
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '--';
    
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
  };

  const getCountryFlag = (input?: string) => {
      const code = (input || 'NZL').toUpperCase().trim();
      
      const map: Record<string, string> = {
          'NZL': '🇳🇿', 'NZ': '🇳🇿',
          'AUS': '🇦🇺', 'AU': '🇦🇺',
          'USA': '🇺🇸', 'US': '🇺🇸',
          'GBR': '🇬🇧', 'UK': '🇬🇧',
          'CAN': '🇨🇦', 'CA': '🇨🇦',
          'FRA': '🇫🇷', 'FR': '🇫🇷',
          'DEU': '🇩🇪', 'DE': '🇩🇪', 'GER': '🇩🇪',
          'JPN': '🇯🇵', 'JP': '🇯🇵',
          'ESP': '🇪🇸', 'ES': '🇪🇸',
          'CHN': '🇨🇳', 'CN': '🇨🇳',
          'KOR': '🇰🇷', 'KR': '🇰🇷',
          'BRA': '🇧🇷', 'BR': '🇧🇷',
          'IND': '🇮🇳', 'IN': '🇮🇳',
          'ITA': '🇮🇹', 'IT': '🇮🇹',
          'NLD': '🇳🇱', 'NL': '🇳🇱',
          'SWE': '🇸🇪', 'SE': '🇸🇪',
          'ZAF': '🇿🇦', 'ZA': '🇿🇦',
          'MEX': '🇲🇽', 'MX': '🇲🇽',
      };

      return map[code] || '🏳️'; // Default to white flag if unknown
  };

  const flag = getCountryFlag(userProfile.country);

  // Helper to split name for styling
  const names = (userProfile.displayName || 'User').split(' ');
  const firstName = names[0];
  const lastName = names.length > 1 ? names.slice(1).join(' ') : '';

  // Determine profile image to show (Base64 > URL > Initial)
  const profileImageSrc = userProfile.photoData || userProfile.photoURL;

  const handleSyncDupr = async () => {
      if (!userProfile.duprId) {
          console.warn("Please add your DUPR ID in your profile first.");
          onEditProfile();
          return;
      }

      setIsSyncingDupr(true);
      try {
          const ratings = await fetchDuprRatings(userProfile.duprId);
          await updateUserExtendedProfile({
              duprSinglesRating: ratings.singles,
              duprDoublesRating: ratings.doubles,
              duprLastUpdatedManually: Date.now()
          });
      } catch (error) {
          console.error("Error syncing DUPR:", error);
      } finally {
          setIsSyncingDupr(false);
      }
  };

  const StatItem = ({ label, value }: { label: string, value: React.ReactNode }) => (
      <div className="flex flex-col items-end justify-center">
          <span className="text-[9px] sm:text-[10px] text-gray-500 font-bold uppercase leading-none mb-1">{label}</span>
          <span className="text-xs sm:text-sm font-bold text-white leading-none whitespace-nowrap">{value}</span>
      </div>
  );

  const navItems = [
    { label: "My Tournaments", view: "myTournaments" },
    { label: "My Results", view: "myResults" },
    { label: "My Leagues", view: "myLeagues" },
    { label: "My Team Leagues", view: "myTeamLeagues" },
    { label: "My Clubs", view: "myClub" },
  ];

  return (
    <div className="max-w-5xl mx-auto mt-4 animate-fade-in flex flex-col h-full">
        <h1 className="text-3xl font-bold text-white mb-6">My Dashboard</h1>

        {/* Profile Card */}
        <div className="bg-gradient-to-r from-gray-800 via-gray-800 to-slate-900 rounded-xl p-4 sm:p-6 shadow-xl border border-gray-700 relative overflow-hidden mb-6">
            
            {/* Edit Button */}
            <div className="absolute top-3 right-3 z-30">
                <button 
                    onClick={onEditProfile}
                    className="text-gray-400 hover:text-white p-1.5 rounded-md transition-colors hover:bg-gray-700 bg-black/20 backdrop-blur-sm"
                    title="Edit Profile"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                </button>
            </div>

            {/* Main Layout Container */}
            <div className="flex flex-row items-center justify-between gap-3 sm:gap-8 z-10 relative">
                
                {/* LEFT: Picture & Country */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0 w-20 sm:w-auto">
                    <div className="relative group">
                        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gray-700/50 p-1 shadow-lg backdrop-blur-sm ring-2 ring-gray-700/50">
                            <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-600">
                                {profileImageSrc ? (
                                    <img 
                                        src={profileImageSrc} 
                                        alt={userProfile.displayName} 
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-2xl sm:text-4xl font-bold text-gray-500 select-none">
                                        {firstName[0]}{lastName[0] || ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded-full border border-gray-600/30 backdrop-blur-sm">
                         <span className="text-sm leading-none">{flag}</span>
                         <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider truncate max-w-[60px] sm:max-w-none">{userProfile.country || 'N/A'}</span>
                    </div>
                </div>

                {/* MIDDLE: Name & Region */}
                <div className="flex-1 flex flex-col items-center text-center min-w-0 px-1">
                    <h3 className="text-[10px] sm:text-xs font-bold text-green-400 uppercase tracking-widest mb-0.5 truncate w-full">
                        {firstName}
                    </h3>
                    <h1 className="text-2xl sm:text-5xl font-black text-white tracking-tight leading-none truncate w-full mb-1">
                        {lastName}
                    </h1>
                    {userProfile.region && (
                        <div className="inline-block px-2 py-0.5 bg-gray-700/50 rounded text-[10px] sm:text-xs text-gray-300 truncate max-w-full">
                            {userProfile.region}
                        </div>
                    )}
                </div>

                {/* RIGHT: Stats Grid */}
                <div className="flex-shrink-0 grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-6 sm:gap-y-4 text-right border-l border-gray-700 pl-2 sm:pl-6 py-1 min-w-[90px]">
                     <StatItem label="Gender" value={<span className="capitalize">{userProfile.gender?.charAt(0) || '-'}</span>} />
                     <StatItem label="Age" value={getAge(userProfile.birthDate)} />
                     <StatItem label="DUPR (D)" value={userProfile.duprDoublesRating?.toFixed(3) || userProfile.duprRating || 'NR'} />
                     <StatItem label="DUPR (S)" value={userProfile.duprSinglesRating?.toFixed(3) || 'NR'} />
                     <StatItem label="Plays" value={<span className="capitalize">{userProfile.playsHand?.charAt(0) || '-'}</span>} />
                </div>

            </div>

            {/* Background Decorations */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-green-900/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-blue-900/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 mix-blend-overlay pointer-events-none"></div>
        </div>

        {/* Additional Info (Tournaments, Matches, DUPR ID) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            <div className="bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-700 text-center relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <p className="text-[9px] sm:text-[10px] text-gray-500 font-bold uppercase mb-1">Events</p>
                 <p className="text-xl sm:text-2xl font-bold text-white">0</p>
            </div>
            <div className="bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-700 text-center relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <p className="text-[9px] sm:text-[10px] text-gray-500 font-bold uppercase mb-1">Win Rate</p>
                 <p className="text-xl sm:text-2xl font-bold text-white">--%</p>
            </div>
            <div className="bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-700 text-center relative overflow-hidden flex flex-col justify-between items-center group">
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                 
                 <div className="w-full">
                    <p className="text-[9px] sm:text-[10px] text-gray-500 font-bold uppercase mb-1">DUPR ID</p>
                    {userProfile.duprProfileUrl ? (
                        <a 
                            href={userProfile.duprProfileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-sm sm:text-lg font-bold text-green-400 hover:underline truncate px-1 block"
                        >
                            {userProfile.duprId || 'Link'}
                        </a>
                    ) : (
                        <p className="text-sm sm:text-lg font-bold text-white truncate px-1">{userProfile.duprId || '--'}</p>
                    )}
                 </div>
                 
                 {userProfile.duprId && (
                     <button 
                        onClick={handleSyncDupr}
                        disabled={isSyncingDupr}
                        className="mt-2 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded border border-gray-600 flex items-center gap-1 transition-colors relative z-10"
                     >
                        {isSyncingDupr ? (
                            <>
                                <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                                Syncing...
                            </>
                        ) : (
                            <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Update Rating
                            </>
                        )}
                     </button>
                 )}
            </div>
        </div>

        {/* Quick Actions - Bottom Pinned, Single Line, Thin, Light Green */}
        <div className="mt-auto">
             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {navItems.map((item) => (
                    <button
                        key={item.view}
                        onClick={() => onNavigate(item.view)}
                        className="flex-1 min-w-[110px] bg-green-900/20 hover:bg-green-900/40 text-green-300 border border-green-500/30 hover:border-green-500/60 rounded-full py-1.5 px-4 text-xs font-medium transition-all whitespace-nowrap shadow-sm"
                    >
                        {item.label}
                    </button>
                ))}
             </div>
        </div>
    </div>
  );
};
