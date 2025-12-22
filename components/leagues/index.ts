/**
 * League Components Index
 * 
 * Central export file for all league-related components.
 * 
 * FILE LOCATION: components/leagues/index.ts
 * VERSION: V05.37
 */

// Main Pages
export { CreateLeague } from './CreateLeague';
export { LeagueDetail } from './LeagueDetail';
export { LeaguesList } from './LeaguesList';

// Modals & Wizards
export { LeagueRegistrationWizard } from './LeagueRegistrationWizard';
export { LeagueScoreEntryModal } from './LeagueScoreEntryModal';

// Schedule Management (V05.32)
export { LeagueScheduleManager } from './LeagueScheduleManager';

// Display Components
export { LeagueMatchCard } from './LeagueMatchCard';
export { LeagueStandings } from './LeagueStandings';

// Postpone/Reschedule Components (NEW V05.37)
export { PostponeMatchModal } from './PostponeMatchModal';
export { PostponeWeekModal } from './PostponeWeekModal';
export { PostponedMatchesList } from './PostponedMatchesList';

// Note: Import ChallengeModal directly when needed:
// import { ChallengeModal } from './ChallengeModal';