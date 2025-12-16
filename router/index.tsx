/**
 * Router Configuration - AI Studio Compatible
 * 
 * Uses createHashRouter instead of createBrowserRouter for AI Studio compatibility.
 * No lazy loading - direct imports for reliability.
 * 
 * FILE LOCATION: router/index.tsx
 */

import React from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layouts/AppLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { ROUTES } from './routes';

// Direct imports (no lazy loading for AI Studio compatibility)
import DashboardPage from '../pages/DashboardPage';
import TournamentsPage from '../pages/TournamentsPage';
import TournamentDetailPage from '../pages/TournamentDetailPage';
import CreateTournamentPage from '../pages/CreateTournamentPage';
import MyEventsPage from '../pages/MyEventsPage';
import ClubsPage from '../pages/ClubsPage';
import ClubDetailPage from '../pages/ClubDetailPage';
import CreateClubPage from '../pages/CreateClubPage';
import MeetupsPage from '../pages/MeetupsPage';
import MeetupDetailPage from '../pages/MeetupDetailPage';
import CreateMeetupPage from '../pages/CreateMeetupPage';
import PlayersPage from '../pages/PlayersPage';
import ProfilePage from '../pages/ProfilePage';
import AdminUsersPage from '../pages/AdminUsersPage';
import InvitesPage from '../pages/InvitesPage';
import PlaceholderPage from '../pages/PlaceholderPage';
import EditMeetupPage from '../pages/EditMeetupPage';

// ============================================
// Router Configuration - Using HashRouter
// URLs will be like: /#/tournaments, /#/clubs/123
// ============================================

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // Redirect root to tournaments
      {
        index: true,
        element: <Navigate to={ROUTES.TOURNAMENTS} replace />,
      },
      
      // Dashboard (requires auth)
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // TOURNAMENTS
      // ==========================================
      {
        path: 'tournaments',
        element: <TournamentsPage />,
      },
      {
        path: 'tournaments/create',
        element: (
          <ProtectedRoute requireOrganizer>
            <CreateTournamentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'tournaments/:id',
        element: <TournamentDetailPage />,
      },
      {
        path: 'my-events',
        element: (
          <ProtectedRoute>
            <MyEventsPage />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // CLUBS
      // ==========================================
      {
        path: 'clubs',
        element: <ClubsPage />,
      },
      {
        path: 'clubs/create',
        element: (
          <ProtectedRoute>
            <CreateClubPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'clubs/:id',
        element: <ClubDetailPage />,
      },
      
      // ==========================================
      // MEETUPS
      // ==========================================
      {
        path: 'meetups',
        element: <MeetupsPage />,
      },
      {
        path: 'meetups/create',
        element: (
          <ProtectedRoute>
            <CreateMeetupPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'meetups/:id',
        element: <MeetupDetailPage />,
      },
      {
        path: 'meetups/:id/edit',
        element: (
          <ProtectedRoute>
            <EditMeetupPage />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // PLAYERS
      // ==========================================
      {
        path: 'players',
        element: <PlayersPage />,
      },
      
      // ==========================================
      // USER
      // ==========================================
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'invites',
        element: (
          <ProtectedRoute>
            <InvitesPage />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // ADMIN
      // ==========================================
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminUsersPage />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // PLACEHOLDERS (Coming Soon)
      // ==========================================
      {
        path: 'results',
        element: (
          <PlaceholderPage 
            title="Match Results" 
            message="View recent match scores and tournament outcomes here soon." 
          />
        ),
      },
      {
        path: 'my-results',
        element: (
          <ProtectedRoute>
            <PlaceholderPage 
              title="My Results" 
              message="Your personal match history and statistics across all tournaments." 
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'leagues',
        element: (
          <PlaceholderPage 
            title="Leagues" 
            message="Join ladder leagues and season-long competitions." 
          />
        ),
      },
      {
        path: 'my-leagues',
        element: (
          <ProtectedRoute>
            <PlaceholderPage 
              title="My Leagues" 
              message="Your league memberships and standings." 
            />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // 404 - Catch all
      // ==========================================
      {
        path: '*',
        element: (
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold text-gray-400 mb-4">404</h1>
            <p className="text-gray-500 mb-4">Page not found</p>
            <a href="#/tournaments" className="text-green-400 hover:underline">
              Go to Tournaments
            </a>
          </div>
        ),
      },
    ],
  },
]);