/**
 * Router Configuration - AI Studio Compatible
 * 
 * Uses createHashRouter instead of createBrowserRouter for AI Studio compatibility.
 * No lazy loading - direct imports for reliability.
 * 
 * FILE LOCATION: router/index.tsx
 */

import React from 'react';
import { createHashRouter } from 'react-router-dom';
import { AppLayout } from '../components/layouts/AppLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { ROUTES } from './routes';

// Direct imports (no lazy loading for AI Studio compatibility)
import HomePage from '../pages/HomePage';
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
import EditMeetupPage from '../pages/EditMeetupPage';
import PlayersPage from '../pages/PlayersPage';
import ProfilePage from '../pages/ProfilePage';
import AdminUsersPage from '../pages/AdminUsersPage';
import InvitesPage from '../pages/InvitesPage';
import PlaceholderPage from '../pages/PlaceholderPage';
import LeaguesPage from '../pages/LeaguesPage';

// ============================================
// Router Configuration - Using HashRouter
// URLs will be like: /#/tournaments, /#/clubs/123
// ============================================

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // Home page - shows Meetups, Leagues, Tournaments overview
      {
        index: true,
        element: <HomePage />,
      },
      
      // Dashboard - also shows HomePage (for logged in users)
      {
        path: 'dashboard',
        element: <HomePage />,
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
      // USER / PROFILE
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
        element: <PlaceholderPage title="Results" message="View tournament results and match history." />,
      },
      {
        path: 'my-results',
        element: (
          <ProtectedRoute>
            <PlaceholderPage title="My Results" message="Your personal match history and statistics." />
          </ProtectedRoute>
        ),
      },
      {
        path: 'leagues',
        element: <LeaguesPage />,
      },
      {
        path: 'leagues/:id',
        element: <LeaguesPage />,
      },
      {
        path: 'my-leagues',
        element: (
          <ProtectedRoute>
            <LeaguesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'team-leagues',
        element: <PlaceholderPage title="Team Leagues" message="Team-based league competitions." />,
      },
      {
        path: 'my-team-leagues',
        element: (
          <ProtectedRoute>
            <PlaceholderPage title="My Team Leagues" message="Your team league memberships." />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);