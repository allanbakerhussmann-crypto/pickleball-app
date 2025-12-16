/**
 * AppLayout Component
 * 
 * Main layout wrapper for all pages.
 * Includes Header, BottomNav, and main content area.
 * 
 * FILE LOCATION: components/layouts/AppLayout.tsx
 */

import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Header } from '../Header';
import { BottomNav } from '../BottomNav';
import { LoginModal } from '../auth/LoginModal';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES, getRoute } from '../../router/routes';
import { subscribeToUserPartnerInvites, ensureRegistrationForUser } from '../../services/firebase';
import type { PartnerInvite } from '../../types';

// Verification Banner Component
const VerificationBanner: React.FC = () => {
  const { resendVerificationEmail, reloadUser } = useAuth();
  const [message, setMessage] = useState('');
  const [isReloading, setIsReloading] = useState(false);

  const handleResend = async () => {
    setMessage('');
    try {
      await resendVerificationEmail();
      setMessage('Email sent! Check your inbox.');
    } catch (error) {
      setMessage('Failed to send verification email.');
      console.error(error);
    }
  };

  const handleCheckVerification = async () => {
    setIsReloading(true);
    setMessage('');
    try {
      await reloadUser();
    } catch (error) {
      setMessage('Error checking status.');
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div className="bg-yellow-900/50 border-b border-yellow-700 px-4 py-2">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-yellow-200">
          Please verify your email to access all features.
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleResend}
            className="text-yellow-400 hover:text-yellow-300 underline"
          >
            Resend Email
          </button>
          <button
            onClick={handleCheckVerification}
            disabled={isReloading}
            className="text-yellow-400 hover:text-yellow-300 underline"
          >
            {isReloading ? 'Checking...' : "I've Verified"}
          </button>
        </div>
        {message && <span className="w-full text-yellow-300 text-xs">{message}</span>}
      </div>
    </div>
  );
};

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile, logout } = useAuth();
  
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PartnerInvite[]>([]);

  // Subscribe to partner invites
  useEffect(() => {
    if (!currentUser?.uid) {
      setPendingInvites([]);
      return;
    }

    const unsubscribe = subscribeToUserPartnerInvites(currentUser.uid, (invites) => {
      setPendingInvites(invites.filter(i => i.status === 'pending'));
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Get current view name from path for Header/BottomNav
  const getActiveView = (): string => {
    const path = location.pathname;
    if (path.startsWith('/tournaments/create')) return 'createTournament';
    if (path.startsWith('/tournaments/')) return 'tournament';
    if (path.startsWith('/tournaments')) return 'tournaments';
    if (path.startsWith('/my-events')) return 'myTournaments';
    if (path.startsWith('/clubs/create')) return 'createClub';
    if (path.startsWith('/clubs/')) return 'clubDetail';
    if (path.startsWith('/clubs')) return 'clubs';
    if (path.startsWith('/meetups/create')) return 'create_meetup';
    if (path.startsWith('/meetups/')) return 'meetup_detail';
    if (path.startsWith('/meetups')) return 'meetups';
    if (path.startsWith('/players')) return 'players';
    if (path.startsWith('/profile')) return 'profile';
    if (path.startsWith('/admin')) return 'adminUsers';
    if (path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/results')) return 'results';
    if (path.startsWith('/leagues')) return 'leagues';
    return 'tournaments';
  };

  // Navigation handler for Header/BottomNav
  const handleNavigate = (view: string) => {
  switch (view) {
    case 'home':
    case 'dashboard':
      navigate(ROUTES.HOME);
      break;
    case 'tournaments':
      navigate(ROUTES.TOURNAMENTS);
      break;
    case 'createTournament':
      navigate(ROUTES.TOURNAMENT_CREATE);
      break;
    case 'myTournaments':
      navigate(ROUTES.MY_EVENTS);
      break;
    case 'clubs':
      navigate(ROUTES.CLUBS);
      break;
    case 'createClub':
      navigate(ROUTES.CLUB_CREATE);
      break;
    case 'meetups':
      navigate(ROUTES.MEETUPS);
      break;
    case 'create_meetup':
      navigate(ROUTES.MEETUP_CREATE);
      break;
    case 'players':
      navigate(ROUTES.PLAYERS);
      break;
    case 'profile':
      navigate(ROUTES.PROFILE);
      break;
    case 'invites':
      navigate(ROUTES.INVITES);
      break;
    case 'adminUsers':
      navigate(ROUTES.ADMIN_USERS);
      break;
    case 'results':
      navigate(ROUTES.RESULTS);
      break;
    case 'myResults':
      navigate(ROUTES.MY_RESULTS);
      break;
    case 'leagues':
      navigate(ROUTES.LEAGUES);
      break;
    default:
      navigate(ROUTES.HOME);  // Changed from ROUTES.TOURNAMENTS
  }
};

  // Handle accepting partner invite
  const handleAcceptInvite = async (tournamentId: string, divisionId: string) => {
    if (!currentUser) return;
    
    try {
      await ensureRegistrationForUser(tournamentId, currentUser.uid, divisionId);
      navigate(getRoute.tournamentDetail(tournamentId));
    } catch (error) {
      console.error('Failed to accept invite:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.TOURNAMENTS);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Header
        activeView={getActiveView()}
        onNavigate={handleNavigate}
        onLoginClick={() => setLoginModalOpen(true)}
        onLogout={handleLogout}
        currentUser={currentUser}
        userProfile={userProfile}
        onAcceptInvite={handleAcceptInvite}
      />

      {currentUser && !currentUser.emailVerified && <VerificationBanner />}

      <main className="flex-grow p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto w-full">
        <div className="container mx-auto">
          <Outlet />
        </div>
      </main>

      <BottomNav 
        activeView={getActiveView()} 
        onNavigate={handleNavigate} 
      />

      {isLoginModalOpen && (
        <LoginModal onClose={() => setLoginModalOpen(false)} />
      )}
    </div>
  );
};