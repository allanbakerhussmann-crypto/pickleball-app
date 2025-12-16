/**
 * Route Constants
 * 
 * Centralized route path definitions to avoid magic strings throughout the app.
 * 
 * FILE LOCATION: router/routes.ts
 */

export const ROUTES = {
  // Main
  HOME: '/',
  DASHBOARD: '/dashboard',
  
  // Tournaments
  TOURNAMENTS: '/tournaments',
  TOURNAMENT_CREATE: '/tournaments/create',
  TOURNAMENT_DETAIL: '/tournaments/:id',
  MY_EVENTS: '/my-events',
  
  // Clubs
  CLUBS: '/clubs',
  CLUB_CREATE: '/clubs/create',
  CLUB_DETAIL: '/clubs/:id',
  
  // Meetups
  MEETUPS: '/meetups',
  MEETUP_CREATE: '/meetups/create',
  MEETUP_DETAIL: '/meetups/:id',
  
  // Leagues
  LEAGUES: '/leagues',
  LEAGUE_DETAIL: '/leagues/:id',
  MY_LEAGUES: '/my-leagues',
  TEAM_LEAGUES: '/team-leagues',
  MY_TEAM_LEAGUES: '/my-team-leagues',
  
  // Players
  PLAYERS: '/players',
  
  // User
  PROFILE: '/profile',
  INVITES: '/invites',
  
  // Results
  RESULTS: '/results',
  MY_RESULTS: '/my-results',
  
  // Admin
  ADMIN_USERS: '/admin/users',
} as const;

/**
 * Helper function to generate dynamic route paths
 */
export const getRoute = {
  tournamentDetail: (id: string) => `/tournaments/${id}`,
  clubDetail: (id: string) => `/clubs/${id}`,
  meetupDetail: (id: string) => `/meetups/${id}`,
  leagueDetail: (id: string) => `/leagues/${id}`,
};

/**
 * Map old view names to new routes (for migration reference)
 */
export const VIEW_TO_ROUTE: Record<string, string> = {
  'dashboard': ROUTES.DASHBOARD,
  'tournaments': ROUTES.TOURNAMENTS,
  'createTournament': ROUTES.TOURNAMENT_CREATE,
  'myTournaments': ROUTES.MY_EVENTS,
  'clubs': ROUTES.CLUBS,
  'createClub': ROUTES.CLUB_CREATE,
  'meetups': ROUTES.MEETUPS,
  'create_meetup': ROUTES.MEETUP_CREATE,
  'players': ROUTES.PLAYERS,
  'profile': ROUTES.PROFILE,
  'adminUsers': ROUTES.ADMIN_USERS,
  'invites': ROUTES.INVITES,
  'results': ROUTES.RESULTS,
  'myResults': ROUTES.MY_RESULTS,
  'leagues': ROUTES.LEAGUES,
  'myLeagues': ROUTES.MY_LEAGUES,
  'teamLeagues': ROUTES.TEAM_LEAGUES,
  'myTeamLeagues': ROUTES.MY_TEAM_LEAGUES,
};