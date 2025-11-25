
import React, { useState, useRef, useEffect } from 'react';
import { PickleballDirectorLogo } from './icons/PickleballDirectorLogo';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  currentUser: any;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onNavigate, currentUser }) => {
  const { logout, isOrganizer } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Tournaments', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
    )},
    { id: 'myResults', label: 'My Results', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
    )},
  ];

  // Only show Create New if user is an organizer
  if (isOrganizer) {
      navItems.push({ id: 'createTournament', label: 'Create New', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
      )});
  }

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0 z-20">
      {/* Brand */}
      <div className="p-6 flex items-center gap-3 border-b border-gray-800">
        <PickleballDirectorLogo className="h-8 w-auto flex-shrink-0" />
        <span className="font-bold text-white tracking-tight text-lg">PickleballDirector</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors text-sm font-medium ${
              activeView === item.id 
                ? 'bg-green-600/10 text-green-400 border border-green-600/20' 
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* User & Dropdown Footer */}
      <div className="p-4 border-t border-gray-800 bg-gray-900 relative" ref={menuRef}>
        
        {/* Popup Menu */}
        {isMenuOpen && (
            <div className="absolute bottom-full left-0 w-full mb-2 px-4 z-50">
                <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden py-1 animate-fade-in-up">
                    <button 
                        onClick={() => { onNavigate('profile'); setIsMenuOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-3"
                    >
                         <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                         My Profile
                    </button>
                    <button 
                        onClick={() => { onNavigate('myTournaments'); setIsMenuOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-3"
                    >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        My Tournaments
                    </button>
                    <button 
                        onClick={() => { onNavigate('myResults'); setIsMenuOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-3"
                    >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        My Results
                    </button>
                    <div className="h-px bg-gray-700 my-1 mx-2" />
                    <button 
                        onClick={() => logout()}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-3"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Sign Out
                    </button>
                </div>
            </div>
        )}

        {/* Trigger Button */}
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-full flex items-center gap-3 p-2 rounded-md transition-colors group focus:outline-none ${isMenuOpen ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
        >
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white group-hover:bg-gray-600 border border-gray-600">
            {currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 overflow-hidden text-left">
            <p className="text-sm font-medium text-white truncate group-hover:text-green-400 transition-colors">{currentUser?.displayName || 'User'}</p>
            <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
          </div>
          <svg className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
