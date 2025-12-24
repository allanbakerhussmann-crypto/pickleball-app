/**
 * Header Component
 * 
 * Main navigation header with:
 * - Logo and branding
 * - Desktop navigation links
 * - User profile menu (role-based visibility)
 * - Partner invites notifications
 * - Admin menu (ONLY visible to app_admin role)
 * 
 * FILE LOCATION: components/Header.tsx
 * VERSION: V05.17 - Fixed role-based menu visibility
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PickleballDirectorLogo } from './icons/PickleballDirectorLogo';
import type { UserProfile } from '../types';
import { usePartnerInvites } from '../hooks/usePartnerInvites';
import { useAuth } from '../contexts/AuthContext';
import { respondToPartnerInvite, getTournament, getUserProfile, ensureRegistrationForUser } from '../services/firebase';
import { HelpModal } from './HelpModal';

interface HeaderProps {
    activeView: string;
    onNavigate: (view: string) => void;
    onLoginClick: () => void;
    onLogout: () => void;
    currentUser: any;
    userProfile: UserProfile | null;
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
  const navigate = useNavigate();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  
  // Get role info from AuthContext (most reliable source)
  const { isAppAdmin } = useAuth();
  
  const { invites } = usePartnerInvites(currentUser?.uid);
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
      { id: 'tournaments', label: 'Tournaments' },
      { id: 'meetups', label: 'Meetups' },
      { id: 'leagues', label: 'Leagues' },
      { id: 'clubs', label: 'Clubs' },
      { id: 'players', label: 'Players' },
      { id: 'score', label: 'Score' },
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
               await ensureRegistrationForUser(result.tournamentId, currentUser.uid, result.divisionId);
               onAcceptInvite(result.tournamentId, result.divisionId);
               setIsProfileMenuOpen(false);
          }
      } catch (e) {
          console.error(e);
      }
  };

  // Determine profile image to show
  const profileImageSrc = userProfile?.photoURL || currentUser?.photoURL;

  return (
    <>
        <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 shadow-sm backdrop-blur-sm bg-gray-900/90">
        <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-14 md:h-16">
                
                {/* LEFT: Logo & Desktop Nav */}
                <div className="flex items-center gap-8">
                    {/* Logo */}
                    <button 
                        onClick={() => onNavigate('home')} 
                        className="flex items-center gap-2 focus:outline-none group"
                    >
                        <PickleballDirectorLogo className="h-6 w-auto flex-shrink-0 md:h-7" />
                        <span className="text-lg font-bold tracking-tight text-white">
                            PickleballDirector
                        </span>
                    </button>

                    {/* Desktop Navigation (Hidden on Mobile) */}
                    {currentUser && (
                        <nav className="hidden md:flex items-center gap-1">
                            {navLinks.map(link => (
                                <button
                                    key={link.id}
                                    onClick={() => onNavigate(link.id)}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        activeView === link.id
                                        ? 'text-green-400 bg-green-900/30'
                                        : 'text-gray-300 hover:text-white hover:bg-gray-800'
                                    }`}
                                >
                                    {link.label}
                                </button>
                            ))}
                        </nav>
                    )}
                </div>

                {/* RIGHT: Help + Profile */}
                <div className="flex items-center gap-3">
                    {/* Help Button */}
                    <button
                        onClick={() => setIsHelpModalOpen(true)}
                        className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors"
                        title="Help"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>

                    {currentUser ? (
                        <>
                            {/* Profile Dropdown */}
                            <div ref={profileMenuRef} className="relative">
                                <button 
                                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                                    className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden border-2 border-green-500">
                                        {profileImageSrc ? (
                                            <img src={profileImageSrc} alt="Profile" className="w-full h-full object-cover" />
                                        ) : (
                                            currentUser.displayName?.charAt(0) || currentUser.email?.charAt(0) || '?'
                                        )}
                                    </div>
                                    {invites.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold animate-pulse">
                                            {invites.length}
                                        </span>
                                    )}
                                </button>

                                {/* Dropdown Menu */}
                                {isProfileMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-72 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 z-50">
                                        {/* User Info Header */}
                                        <div className="px-4 py-2 border-b border-gray-700">
                                            <p className="font-bold text-white truncate">{currentUser.displayName || 'User'}</p>
                                            <p className="text-xs text-gray-400 truncate">{currentUser.email}</p>
                                        </div>

                                        {/* Pending Invites */}
                                        {invites.length > 0 && (
                                            <div className="px-4 py-2 border-b border-gray-700 bg-yellow-900/20">
                                                <p className="text-xs font-bold text-yellow-400 uppercase mb-2">Partner Invites</p>
                                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                                    {invites.map(inv => (
                                                        <div key={inv.id} className="bg-gray-900/50 rounded p-2">
                                                            <p className="text-sm text-white truncate">{inviteMeta[inv.id]?.tName || 'Loading...'}</p>
                                                            <p className="text-xs text-gray-400">From: {inviteMeta[inv.id]?.uName || '...'}</p>
                                                            <div className="flex gap-2 mt-2">
                                                                <button onClick={() => handleAcceptInvite(inv)} className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded">Accept</button>
                                                                <button onClick={async () => { await respondToPartnerInvite(inv, 'declined'); }} className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded">Decline</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Standard Menu Items - Available to ALL logged in users */}
                                        <button 
                                            onClick={() => { navigate('/dashboard'); setIsProfileMenuOpen(false); }}
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
                                        
                                        {/* ============================================ */}
                                        {/* ADMIN SECTION - ONLY visible to app admins */}
                                        {/* ============================================ */}
                                        {isAppAdmin && (
                                            <>
                                                <div className="h-px bg-gray-700 my-1 mx-2"></div>
                                                <div className="px-2 py-1">
                                                    <p className="text-xs font-bold text-red-400 uppercase px-2 mb-1">Admin</p>
                                                </div>
                                                
                                                {/* Admin Dashboard */}
                                                <button 
                                                    onClick={() => { navigate('/admin'); setIsProfileMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                    </svg>
                                                    Admin Dashboard
                                                </button>
                                                
                                                {/* Stripe Debug */}
                                                <button 
                                                    onClick={() => { navigate('/debug/stripe'); setIsProfileMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-yellow-400 hover:bg-gray-700 hover:text-yellow-300 flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    Stripe Debug
                                                    <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">DEV</span>
                                                </button>
                                                
                                                {/* Manage Users */}
                                                <button 
                                                    onClick={() => { onNavigate('adminUsers'); setIsProfileMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                    Manage Users
                                                </button>
                                                
                                                {/* Organizer Requests */}
                                                <button 
                                                    onClick={() => { onNavigate('adminOrganizerRequests'); setIsProfileMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                                    Organizer Requests
                                                </button>
                                                
                                                {/* Test Payments */}
                                                <button 
                                                    onClick={() => { navigate('/admin/test-payments'); setIsProfileMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                                    Test Payments
                                                </button>
                                            </>
                                        )}
                                        
                                        {/* Sign Out - Always at bottom */}
                                        <div className="h-px bg-gray-700 my-1 mx-2"></div>
                                        <button 
                                            onClick={() => { onLogout(); setIsProfileMenuOpen(false); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            Sign Out
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <button
                            onClick={onLoginClick}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors text-sm"
                        >
                            Sign In
                        </button>
                    )}
                </div>
            </div>
        </div>
        </header>

        {/* Help Modal - rendered conditionally */}
        {isHelpModalOpen && <HelpModal onClose={() => setIsHelpModalOpen(false)} />}
    </>
  );
};

export default Header;