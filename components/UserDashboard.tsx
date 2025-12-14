
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { fetchDuprRatings } from '../services/duprService';

interface UserDashboardProps {
  userProfile: UserProfile;
  onEditProfile: () => void;
  onNavigate: (view: string) => void;
}

// Mock Activity Data
const MOCK_ACTIVITY = [
    { id: 1, type: 'match', title: 'Match Won', desc: 'Defeated Team Alpha 11-9', time: '2h ago', points: '+3' },
    { id: 2, type: 'registration', title: 'Joined Tournament', desc: 'Summer Slam 2024 - Mixed Doubles', time: '1d ago', points: '' },
    { id: 3, type: 'rating', title: 'Rating Updated', desc: 'DUPR increased to 4.12', time: '3d ago', points: '+0.05' },
    { id: 4, type: 'match', title: 'Match Lost', desc: 'Lost to Net Ninjas 8-11', time: '4d ago', points: '+1' },
];

export const UserDashboard: React.FC<UserDashboardProps> = ({ userProfile, onEditProfile, onNavigate }) => {
  const { updateUserExtendedProfile } = useAuth();
  const [isSyncingDupr, setIsSyncingDupr] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'pass'>('overview');

  const getAge = (birthDate?: string) => {
    if (!birthDate) return '--';
    const today = new Date();
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '--';
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const getCountryFlag = (input?: string) => {
      const code = (input || 'NZL').toUpperCase().trim();
      const map: Record<string, string> = { 'NZL': '🇳🇿', 'AUS': '🇦🇺', 'USA': '🇺🇸', 'GBR': '🇬🇧', 'CAN': '🇨🇦' };
      return map[code] || '🏳️';
  };

  const flag = getCountryFlag(userProfile.country);
  const names = (userProfile.displayName || 'User').split(' ');
  const firstName = names[0];
  const lastName = names.length > 1 ? names.slice(1).join(' ') : '';
  const profileImageSrc = userProfile.photoData || userProfile.photoURL;

  const handleSyncDupr = async () => {
      if (!userProfile.duprId) {
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

  return (
    <div className="max-w-5xl mx-auto mt-4 animate-fade-in flex flex-col h-full px-4">
        
        {/* Profile / Header Card */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl border border-gray-700/50 relative overflow-hidden mb-6">
            <div className="flex items-center gap-6 relative z-10">
                <div className="relative group cursor-pointer" onClick={() => setActiveTab('pass')}>
                    <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-green-400 to-blue-500 shadow-lg">
                        <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center overflow-hidden">
                            {profileImageSrc ? (
                                <img src={profileImageSrc} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-3xl font-black text-white">{firstName[0]}</span>
                            )}
                        </div>
                    </div>
                    {/* QR Icon Badge */}
                    <div className="absolute -bottom-1 -right-1 bg-white text-gray-900 p-1.5 rounded-full shadow-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                    </div>
                </div>
                
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{flag}</span>
                        <h1 className="text-3xl font-black text-white tracking-tight">{firstName} {lastName}</h1>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-400">
                        {userProfile.region && <span>{userProfile.region}</span>}
                        <span>Age: {getAge(userProfile.birthDate)}</span>
                        <span className="capitalize">{userProfile.gender}</span>
                    </div>
                </div>

                <div className="hidden sm:flex gap-6 text-right">
                    <div>
                        <div className="text-2xl font-black text-white">{userProfile.duprDoublesRating?.toFixed(3) || 'NR'}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Doubles</div>
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{userProfile.duprSinglesRating?.toFixed(3) || 'NR'}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Singles</div>
                    </div>
                </div>
            </div>
            
            <div className="absolute top-4 right-4 flex gap-3">
                <button onClick={onEditProfile} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-800">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-800 mb-6 px-2">
            <button onClick={() => setActiveTab('overview')} className={`pb-3 text-sm font-bold transition-colors ${activeTab === 'overview' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500 hover:text-gray-300'}`}>Overview</button>
            <button onClick={() => setActiveTab('pass')} className={`pb-3 text-sm font-bold transition-colors ${activeTab === 'pass' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500 hover:text-gray-300'}`}>Player Pass</button>
            <button onClick={() => setActiveTab('feed')} className={`pb-3 text-sm font-bold transition-colors ${activeTab === 'feed' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500 hover:text-gray-300'}`}>Activity</button>
        </div>

        {activeTab === 'pass' && (
            <div className="flex flex-col items-center animate-fade-in-up">
                <div className="bg-white text-gray-900 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
                    {/* Pass Header */}
                    <div className="bg-green-600 p-6 text-center">
                        <h2 className="text-white font-black text-2xl tracking-tight uppercase">Official Player Pass</h2>
                        <p className="text-green-100 text-sm opacity-80">PickleballDirector Season 2024</p>
                    </div>
                    
                    {/* Pass Body */}
                    <div className="p-8 flex flex-col items-center">
                        <div className="w-48 h-48 bg-gray-900 rounded-xl p-2 mb-6 shadow-inner">
                            {/* Simulated QR Code */}
                            <div className="w-full h-full bg-white rounded-lg flex flex-wrap content-start p-1">
                                {Array.from({length: 100}).map((_, i) => (
                                    <div key={i} className={`w-[10%] h-[10%] ${Math.random() > 0.5 ? 'bg-black' : 'bg-transparent'}`}></div>
                                ))}
                                {/* QR Eyes */}
                                <div className="absolute top-4 left-4 w-12 h-12 border-4 border-black bg-white flex items-center justify-center"><div className="w-6 h-6 bg-black"></div></div>
                                <div className="absolute top-4 right-4 w-12 h-12 border-4 border-black bg-white flex items-center justify-center"><div className="w-6 h-6 bg-black"></div></div>
                                <div className="absolute bottom-10 left-4 w-12 h-12 border-4 border-black bg-white flex items-center justify-center"><div className="w-6 h-6 bg-black"></div></div>
                            </div>
                        </div>
                        
                        <h3 className="text-2xl font-bold text-gray-900 mb-1">{userProfile.displayName}</h3>
                        <p className="text-gray-500 font-mono text-xs mb-6 uppercase tracking-widest">{userProfile.id.substring(0,8)}...{userProfile.id.substring(userProfile.id.length-4)}</p>
                        
                        <div className="flex w-full justify-between border-t border-gray-200 pt-6">
                            <div className="text-center">
                                <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Doubles</div>
                                <div className="text-xl font-black text-gray-800">{userProfile.duprDoublesRating?.toFixed(2) || '-'}</div>
                            </div>
                            <div className="text-center border-l border-gray-200 pl-6">
                                <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Status</div>
                                <div className="text-xl font-black text-green-600">Active</div>
                            </div>
                            <div className="text-center border-l border-gray-200 pl-6">
                                <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Singles</div>
                                <div className="text-xl font-black text-gray-800">{userProfile.duprSinglesRating?.toFixed(2) || '-'}</div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Scanner Line Animation */}
                    <div className="absolute top-[180px] left-0 right-0 h-1 bg-red-500/50 blur-sm animate-scan"></div>
                </div>
                <p className="mt-6 text-gray-500 text-sm">Present this code at the tournament desk for rapid check-in.</p>
            </div>
        )}

        {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Navigation Tiles */}
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => onNavigate('myTournaments')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-xl text-left border border-gray-700 group transition-all">
                        <div className="w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center mb-3 text-blue-400 group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </div>
                        <h3 className="font-bold text-white">Tournaments</h3>
                        <p className="text-xs text-gray-500 mt-1">Manage entries</p>
                    </button>
                    <button onClick={() => onNavigate('myResults')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-xl text-left border border-gray-700 group transition-all">
                        <div className="w-10 h-10 bg-green-900/30 rounded-lg flex items-center justify-center mb-3 text-green-400 group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="font-bold text-white">Results</h3>
                        <p className="text-xs text-gray-500 mt-1">View history</p>
                    </button>
                    <button onClick={() => onNavigate('myLeagues')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-xl text-left border border-gray-700 group transition-all">
                        <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center mb-3 text-purple-400 group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <h3 className="font-bold text-white">Leagues</h3>
                        <p className="text-xs text-gray-500 mt-1">Season standings</p>
                    </button>
                    <button onClick={() => onNavigate('myClub')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-xl text-left border border-gray-700 group transition-all">
                        <div className="w-10 h-10 bg-orange-900/30 rounded-lg flex items-center justify-center mb-3 text-orange-400 group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <h3 className="font-bold text-white">Clubs</h3>
                        <p className="text-xs text-gray-500 mt-1">My communities</p>
                    </button>
                </div>

                {/* Stats Summary */}
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Performance
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center pb-3 border-b border-gray-700">
                            <span className="text-gray-400 text-sm">Matches Played</span>
                            <span className="text-white font-bold">0</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-gray-700">
                            <span className="text-gray-400 text-sm">Win Rate</span>
                            <span className="text-white font-bold">--%</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">Tournaments Won</span>
                            <span className="text-yellow-400 font-bold">0</span>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleSyncDupr} 
                        disabled={isSyncingDupr}
                        className="w-full mt-6 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        {isSyncingDupr ? 'Syncing...' : 'Refresh DUPR Ratings'}
                    </button>
                </div>
            </div>
        )}

        {activeTab === 'feed' && (
            <div className="space-y-4">
                {MOCK_ACTIVITY.map(item => (
                    <div key={item.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex gap-4 items-start animate-fade-in-up">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.type === 'match' ? 'bg-blue-900/30 text-blue-400' :
                            item.type === 'registration' ? 'bg-purple-900/30 text-purple-400' :
                            'bg-green-900/30 text-green-400'
                        }`}>
                            {item.type === 'match' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                            {item.type === 'registration' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                            {item.type === 'rating' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-white text-sm">{item.title}</h4>
                                <span className="text-xs text-gray-500">{item.time}</span>
                            </div>
                            <p className="text-sm text-gray-400 mt-0.5">{item.desc}</p>
                        </div>
                        {item.points && (
                            <div className="flex items-center self-center text-green-400 font-bold text-sm bg-green-900/20 px-2 py-1 rounded">
                                {item.points}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
    </div>
  );
};
