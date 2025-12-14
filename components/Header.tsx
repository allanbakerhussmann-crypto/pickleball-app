
import React, { useState, useRef, useEffect } from 'react';
import { PickleballDirectorLogo } from './icons/PickleballDirectorLogo';
import type { UserProfile } from '../types';
import { usePartnerInvites } from '../hooks/usePartnerInvites';
import { respondToPartnerInvite, getTournament, getUserProfile, ensureRegistrationForUser } from '../services/firebase';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { NotificationCenter } from './NotificationCenter';

interface HeaderProps {
    activeView: string;
    onNavigate: (view: string) => void;
    onLoginClick: () => void;
    onLogout: () => void;
    currentUser: any; // Auth User
    userProfile: UserProfile | null; // Extended Profile
    onAcceptInvite?: (tournamentId: string, divisionId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
    activeView, 
    onNavigate, 
    onLoginClick, 
    onLogout, 
    currentUser,
    userProfile,
    onAcceptInvite
}) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  
  const { invites, loading: invitesLoading } = usePartnerInvites(currentUser?.uid);
  const [inviteMeta, setInviteMeta] = useState<Record<string, { tName: string, uName: string }>>({});

  // Resolve Names for Invites
  useEffect(() => {
      if (invites.length === 0) return;
      const loadMeta = async () => {
          const meta: Record<string, { tName: string, uName: string }> = {};
          
          for (const inv of invites) {
              const [t, u] = await Promise.all([
                  getTournament(inv.tournamentId),
                  getUserProfile(inv.inviterId)
              ]);
              meta[inv.id] = {
                  tName: t?.name || 'Unknown Tournament',
                  uName: u?.displayName || 'Unknown Player'
              };
          }
          setInviteMeta(meta);
      };
      loadMeta();
  }, [invites]);

  const navLinks = [
      { id: 'socialPlay', label: 'Social Play', visible: true },
      { id: 'tournaments', label: 'Tournaments', visible: true },
      { id: 'results', label: 'Results', visible: true },
      { id: 'leagues', label: 'Leagues', visible: FEATURE_FLAGS.ENABLE_LEAGUES },
      { id: 'teamLeagues', label: 'Team Leagues', visible: FEATURE_FLAGS.ENABLE_TEAM_LEAGUES },
      { id: 'clubs', label: 'Clubs', visible: true },
      { id: 'players', label: 'Players', visible: true },
  ];

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAcceptInvite = async (inv: any) => {
      try {
          const result = await respondToPartnerInvite(inv, 'accepted');
          if (result && currentUser && onAcceptInvite) {
               // Ensure reg exists
               await ensureRegistrationForUser(result.tournamentId, currentUser.uid, result.divisionId);
               // Trigger Wizard
               onAcceptInvite(result.tournamentId, result.divisionId);
               setIsProfileMenuOpen(false);
          }
      } catch (e) {
          console.error(e);
      }
  };

  // Determine profile image to show
  const profileImageSrc = userProfile?.photoData || userProfile?.photoURL || currentUser?.photoURL;
  const isAppAdmin = userProfile?.roles?.includes('admin');

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
            
            {/* LEFT: Logo & Desktop Nav */}
            <div className="flex items-center gap-8">
                {/* Logo */}
                <button 
                    onClick={() => onNavigate('dashboard')} 
                    className="flex items-center gap-2 focus:outline-none group"
                >
                    <PickleballDirectorLogo className="h-7 w-auto flex-shrink-0" />
                    <span className="text-lg font-bold tracking-tight text-white hidden sm:block">
                        PickleballDirector
                    </span>
                </button>

                {/* Desktop Navigation */}
                {currentUser && (
                    <nav className="hidden md:flex items-center gap-1">
                        {navLinks.filter(l => l.visible).map(link => (
                            <button
                                key={link.id}
                                onClick={() => onNavigate(link.id)}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    activeView === link.id
                                    ? 'text-white bg-gray-800'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                }`}
                            >
                                {link.label}
                            </button>
                        ))}
                    </nav>
                )}
            </div>

            {/* RIGHT: User Profile or Login */}
            <div className="flex items-center gap-4">
                {currentUser ? (
                    <>
                         <button 
                            onClick={() => onNavigate('help')}
                            className="text-gray-400 hover:text-white transition-colors p-2"
                            title="Help & FAQ"
                         >
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         </button>

                         <NotificationCenter />

                         {/* Mobile Nav Toggle */}
                        <button 
                            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                            className="md:hidden text-gray-400 hover:text-white p-2"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMobileNavOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>

                        {/* Profile Dropdown */}
                        <div ref={profileMenuRef} className="relative">
                            <button 
                                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                                className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 py-1.5 pl-2 pr-3 rounded-full transition-colors border border-gray-700 focus:ring-2 focus:ring-green-500 focus:outline-none"
                            >
                                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600">
                                    {profileImageSrc ? (
                                        <img 
                                            src={profileImageSrc} 
                                            alt="Profile" 
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">
                                            {currentUser.displayName?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
                                        </div>
                                    )}
                                </div>
                                <span className="text-sm text-white font-medium hidden lg:block max-w-[100px] truncate">
                                    {currentUser.displayName || 'User'}
                                </span>
                                <svg className={`w-3 h-3 text-gray-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isProfileMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-72 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-50 animate-fade-in">
                                    <div className="px-4 py-3 border-b border-gray-700 block lg:hidden">
                                        <p className="text-sm text-white font-bold truncate">{currentUser.displayName}</p>
                                        <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                                    </div>
                                    <button 
                                        onClick={() => { onNavigate('dashboard'); setIsProfileMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                        My Dashboard
                                    </button>
                                    <button 
                                        onClick={() => { onNavigate('profile'); setIsProfileMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        Edit Profile
                                    </button>
                                    
                                    {isAppAdmin && (
                                        <>
                                            <div className="h-px bg-gray-700 my-1 mx-2"></div>
                                            <button 
                                                onClick={() => { onNavigate('adminUsers'); setIsProfileMenuOpen(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2 font-bold"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                Admin Users
                                            </button>
                                            {FEATURE_FLAGS.ENABLE_DEV_TOOLS && (
                                                <button 
                                                    onClick={() => { onNavigate('devTools'); setIsProfileMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-yellow-400 hover:bg-gray-700 hover:text-yellow-300 flex items-center gap-2 font-bold"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                                    Dev Tools
                                                </button>
                                            )}
                                        </>
                                    )}

                                    <div className="h-px bg-gray-700 my-1 mx-2"></div>
                                    
                                    <button 
                                        onClick={() => { onNavigate('myTournaments'); setIsProfileMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                        My Tournaments
                                    </button>
                                    <button 
                                        onClick={() => { onNavigate('invites'); setIsProfileMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                        My Invites Page
                                    </button>
                                    <button 
                                        onClick={() => { onNavigate('myResults'); setIsProfileMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                        My Results
                                    </button>

                                    {/* Partner Invites Widget */}
                                    <div className="mt-4 border-t border-gray-700 pt-3 px-3 pb-3">
                                      <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-gray-400 uppercase">My Invites</span>
                                        {!invitesLoading && invites.length > 0 && (
                                          <span className="text-[10px] bg-green-700 text-white px-2 py-0.5 rounded-full">
                                            {invites.length}
                                          </span>
                                        )}
                                      </div>

                                      {invitesLoading ? (
                                        <div className="text-xs text-gray-500">Loading…</div>
                                      ) : invites.length === 0 ? (
                                        <div className="text-xs text-gray-500 italic">No pending invites.</div>
                                      ) : (
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                          {invites.map((inv) => (
                                            <div
                                              key={inv.id}
                                              className="bg-gray-800 border border-gray-700 rounded p-2 text-xs text-gray-200"
                                            >
                                              <div className="font-semibold mb-1 text-white">
                                                {inviteMeta[inv.id]?.tName || 'Loading...'}
                                              </div>
                                              <div className="text-gray-400 mb-2 truncate">
                                                From: <span className="font-bold text-gray-300">{inviteMeta[inv.id]?.uName || 'Loading...'}</span>
                                              </div>
                                              <div className="flex gap-2 justify-end">
                                                <button
                                                  className="px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-[11px]"
                                                  onClick={(e) => { e.stopPropagation(); handleAcceptInvite(inv); }}
                                                >
                                                  Accept
                                                </button>
                                                <button
                                                  className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-[11px]"
                                                  onClick={(e) => { e.stopPropagation(); respondToPartnerInvite(inv, 'declined'); }}
                                                >
                                                  Decline
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className="h-px bg-gray-700 my-1 mx-2"></div>
                                    <button 
                                        onClick={() => { onLogout(); setIsProfileMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <button onClick={onLoginClick} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 text-sm shadow-lg shadow-green-900/20">
                        Login / Sign Up
                    </button>
                )}
            </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {currentUser && isMobileNavOpen && (
        <div className="md:hidden bg-gray-800 border-b border-gray-700 animate-fade-in">
            <nav className="px-4 pt-2 pb-4 space-y-1">
                {navLinks.filter(l => l.visible).map(link => (
                    <button
                        key={link.id}
                        onClick={() => { onNavigate(link.id); setIsMobileNavOpen(false); }}
                        className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium ${
                            activeView === link.id
                            ? 'bg-gray-900 text-white border-l-4 border-green-500'
                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                    >
                        {link.label}
                    </button>
                ))}
            </nav>
        </div>
      )}
    </header>
  );
};
