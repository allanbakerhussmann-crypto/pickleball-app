
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
          alert("Please add your DUPR ID in your profile first.");
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
          alert("Failed to sync DUPR ratings. Please try again later.");
      } finally {
          setIsSyncingDupr(false);
      }
  };

  const StatBox = ({ label, value, colorClass }: { label: string, value: React.ReactNode, colorClass: string }) => (
      <div className={`flex flex-col items-center justify-center p-2 rounded-lg ${colorClass} bg-opacity-20 border border-white/10 shadow-sm`}>
          <span className="text-[10px] text-gray-300 font-bold uppercase leading-none mb-1 opacity-80">{label}</span>
          <span className="text-sm font-bold text-white leading-none whitespace-nowrap">{value}</span>
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
        <div className="flex items-center justify-between mb-6 pl-2 border-l-4 border-green-500">
            <h1 className="text-3xl font-bold text-white">My Dashboard</h1>
        </div>

        {/* Profile Card */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl border border-gray-700 relative overflow-hidden mb-6">
            
            {/* Edit Button */}
            <div className="absolute top-3 right-3 z-30">
                <button 
                    onClick={onEditProfile}
                    className="text-white/70 hover:text-white p-2 rounded-full transition-colors hover:bg-white/10 bg-black/20 backdrop-blur-md"
                    title="Edit Profile"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                </button>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-6 z-10 relative">
                
                {/* Avatar */}
                <div className="flex-shrink-0">
                    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr from-green-400 to-blue-500 shadow-xl">
                        <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden border-2 border-gray-800">
                            {profileImageSrc ? (
                                <img 
                                    src={profileImageSrc} 
                                    alt={userProfile.displayName} 
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-3xl sm:text-5xl font-bold text-gray-600 select-none">
                                    {firstName[0]}{lastName[0] || ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 text-center md:text-left min-w-0">
                    <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                        <span className="text-2xl">{flag}</span>
                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">{firstName}</span>{' '}
                            <span className="text-green-400">{lastName}</span>
                        </h1>
                    </div>
                    {userProfile.region && (
                        <div className="inline-block px-3 py-1 bg-gray-700/50 rounded-full text-xs font-medium text-gray-300 border border-gray-600 mb-4">
                            {userProfile.region}, {userProfile.country}
                        </div>
                    )}
                    
                    {/* Stats Grid - Colorful Boxes */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-w-lg mx-auto md:mx-0">
                         <StatBox label="Gender" value={<span className="capitalize">{userProfile.gender?.charAt(0) || '-'}</span>} colorClass="bg-blue-600" />
                         <StatBox label="Age" value={getAge(userProfile.birthDate)} colorClass="bg-purple-600" />
                         <StatBox label="DUPR (D)" value={userProfile.duprDoublesRating?.toFixed(2) || 'NR'} colorClass="bg-pink-600" />
                         <StatBox label="DUPR (S)" value={userProfile.duprSinglesRating?.toFixed(2) || 'NR'} colorClass="bg-orange-600" />
                         <StatBox label="Hand" value={<span className="capitalize">{userProfile.playsHand?.charAt(0) || '-'}</span>} colorClass="bg-teal-600" />
                    </div>
                </div>
            </div>

            {/* Background Decorations */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none translate-y-1/2 -translate-x-1/2"></div>
        </div>

        {/* Big Colorful Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {/* Events Card */}
            <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-xl p-5 border border-indigo-700/50 relative overflow-hidden group shadow-lg">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
                 </div>
                 <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Total Events</p>
                 <p className="text-3xl font-black text-white">0</p>
                 <div className="mt-2 h-1 w-full bg-indigo-950 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-400 w-0"></div>
                 </div>
            </div>

            {/* Win Rate Card */}
            <div className="bg-gradient-to-br from-emerald-900 to-green-900 rounded-xl p-5 border border-emerald-700/50 relative overflow-hidden group shadow-lg">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                 </div>
                 <p className="text-emerald-200 text-xs font-bold uppercase tracking-wider mb-1">Win Rate</p>
                 <p className="text-3xl font-black text-white">--%</p>
                 <div className="mt-2 h-1 w-full bg-emerald-950 rounded-full overflow-hidden">
                     <div className="h-full bg-emerald-400 w-0"></div>
                 </div>
            </div>

            {/* DUPR Card */}
            <div className="bg-gradient-to-br from-fuchsia-900 to-purple-900 rounded-xl p-5 border border-fuchsia-700/50 relative overflow-hidden group shadow-lg flex flex-col justify-between">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                 </div>
                 <div>
                    <p className="text-fuchsia-200 text-xs font-bold uppercase tracking-wider mb-1">DUPR ID</p>
                    {userProfile.duprProfileUrl ? (
                        <a 
                            href={userProfile.duprProfileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-2xl font-bold text-white hover:text-fuchsia-300 underline decoration-fuchsia-500/50 underline-offset-4 truncate block"
                        >
                            {userProfile.duprId || 'Link'}
                        </a>
                    ) : (
                        <p className="text-2xl font-bold text-white truncate">{userProfile.duprId || '--'}</p>
                    )}
                 </div>
                 
                 {userProfile.duprId && (
                     <button 
                        onClick={handleSyncDupr}
                        disabled={isSyncingDupr}
                        className="mt-3 self-start text-[10px] bg-black/30 hover:bg-black/50 text-white px-3 py-1.5 rounded-full border border-white/20 flex items-center gap-2 transition-all"
                     >
                        {isSyncingDupr ? (
                            <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Syncing...
                            </>
                        ) : (
                            <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Refresh Ratings
                            </>
                        )}
                     </button>
                 )}
            </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-auto">
             <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Quick Navigation</h3>
             <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {navItems.map((item) => (
                    <button
                        key={item.view}
                        onClick={() => onNavigate(item.view)}
                        className="flex-shrink-0 bg-gray-800 hover:bg-gray-750 text-gray-200 border border-gray-700 rounded-lg py-3 px-5 text-sm font-semibold transition-all shadow-md hover:shadow-lg hover:border-green-500/50 hover:text-green-400 flex flex-col items-center gap-1 min-w-[100px]"
                    >
                        {item.label}
                    </button>
                ))}
             </div>
        </div>
    </div>
  );
};
