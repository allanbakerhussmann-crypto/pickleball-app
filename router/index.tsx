/**
 * Router Configuration - AI Studio Compatible
 *
 * Uses createHashRouter instead of createBrowserRouter for AI Studio compatibility.
 * No lazy loading - direct imports for reliability.
 *
 * UPDATED V06.03:
 * - Added live scoring routes (/score/live/:id, /score/watch/:id)
 * - Added multi-court scoreboard route (/scoreboard/:eventId)
 *
 * FILE LOCATION: router/index.tsx
 * VERSION: V06.03
 */

import { createHashRouter } from 'react-router-dom';
import { AppLayout } from '../components/layouts/AppLayout';
import { ProtectedRoute } from './ProtectedRoute';

// Direct imports (no lazy loading for AI Studio compatibility)
import HomePage from '../pages/HomePage';
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
import AdminOrganizerRequestsPage from '../pages/AdminOrganizerRequestsPage';
import InvitesPage from '../pages/InvitesPage';
import PlaceholderPage from '../pages/PlaceholderPage';
import LeaguesPage from '../pages/LeaguesPage';
import PaymentDemoPage from '../pages/PaymentDemoPage';
import AdminTestPaymentsPage from '../pages/AdminTestPaymentsPage';

// Admin Dashboard and Debug pages
import AdminDashboard from '../pages/AdminDashboard';
import StripeDebugPage from '../pages/StripeDebugPage';

// Scoring Pages (NEW V06.03)
import LiveScoringPage from '../pages/LiveScoringPage';
import WatchScorePage from '../pages/WatchScorePage';
import ScoreboardPage from '../pages/ScoreboardPage';
import ScoringDashboardPage from '../pages/ScoringDashboardPage';

// Public Results Page (V06.19)
import EventResultsPage from '../pages/EventResultsPage';

// Legal / Privacy Pages (V06.04)
import PrivacyPolicyPage from '../pages/PrivacyPolicyPage';
import TermsOfServicePage from '../pages/TermsOfServicePage';
import PrivacyRequestPage from '../pages/PrivacyRequestPage';
import BreachManagementPage from '../pages/admin/BreachManagementPage';

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

      // Dashboard - Score a Game tab
      {
        path: 'dashboard/score',
        element: (
          <ProtectedRoute>
            <ScoringDashboardPage />
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
      
      // Admin Dashboard
      {
        path: 'admin',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminUsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/organizer-requests',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminOrganizerRequestsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/test-payments',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminTestPaymentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/privacy-security',
        element: (
          <ProtectedRoute requireAdmin>
            <BreachManagementPage />
          </ProtectedRoute>
        ),
      },

      // ==========================================
      // DEBUG TOOLS (Admin Only)
      // ==========================================
      
      // Stripe Debug Page
      {
        path: 'debug/stripe',
        element: (
          <ProtectedRoute requireAdmin>
            <StripeDebugPage />
          </ProtectedRoute>
        ),
      },
      
      // ==========================================
      // PAYMENT DEMO (Testing)
      // ==========================================
      {
        path: 'payment-demo',
        element: <PaymentDemoPage />,
      },
      
      // ==========================================
      // RESULTS
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
      
      // ==========================================
      // LEAGUES (UPDATED V05.17)
      // ==========================================
      {
        path: 'leagues',
        element: <LeaguesPage />,
      },
      {
        path: 'leagues/create',
        element: (
          <ProtectedRoute requireOrganizer>
            <LeaguesPage />
          </ProtectedRoute>
        ),
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

      // ==========================================
      // LIVE SCORING (NEW V06.03)
      // ==========================================

      // Live scoring interface (for scorers)
      {
        path: 'score/live/:id',
        element: (
          <ProtectedRoute>
            <LiveScoringPage />
          </ProtectedRoute>
        ),
      },

      // Watch a match (spectator view - public)
      {
        path: 'score/watch/:id',
        element: <WatchScorePage />,
      },

      // Multi-court scoreboard (public)
      {
        path: 'scoreboard/:eventId',
        element: <ScoreboardPage />,
      },

      // Public results page (V06.19) - shows standings, on court, next up, sponsors
      {
        path: 'results/:eventId',
        element: <EventResultsPage />,
      },

      // ==========================================
      // LEGAL / PRIVACY (V06.04)
      // ==========================================
      {
        path: 'privacy-policy',
        element: <PrivacyPolicyPage />,
      },
      {
        path: 'terms',
        element: <TermsOfServicePage />,
      },
      {
        path: 'privacy-request',
        element: <PrivacyRequestPage />,
      },
    ],
  },
]);