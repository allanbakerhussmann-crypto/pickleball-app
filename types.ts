




export type TournamentFormat =
  | 'single_elim'
  | 'double_elim'
  | 'round_robin'
  | 'leaderboard'
  | 'round_robin_knockout'
  | 'swiss';

export type TournamentStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type RegistrationMode = 'signup_page' | 'organiser_provided';
export type Visibility = 'public' | 'private';
// How matches are allocated to courts:
// - 'live' = TD uses live court control / queue
// - 'pre_scheduled' = all matches have times/courts fixed before play starts
export type SchedulingMode = 'live' | 'pre_scheduled';

export type SeedingMethod = 'random' | 'rating' | 'manual';
export type TieBreaker = 'match_wins' | 'point_diff' | 'head_to_head';

export type EventType = 'singles' | 'doubles';
export type GenderCategory = 'men' | 'women' | 'mixed' | 'open';

export type UserRole = 'player' | 'organizer' | 'admin';
export type UserGender = 'male' | 'female';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  roles: UserRole[];
  isRootAdmin?: boolean; 
  
  // Timestamps
  createdAt?: number;
  updatedAt?: number;
  
  // Extended Profile Fields
  photoURL?: string; 
  photoData?: string; 
  photoMimeType?: string; 

  ratingSingles?: number;
  ratingDoubles?: number;
  region?: string;
  country?: string;
  clubId?: string;
  phone?: string;
  gender?: UserGender;
  birthDate?: string;
  height?: string;
  playsHand?: 'right' | 'left';
  duprId?: string;
  
  // DUPR Fields
  duprProfileUrl?: string;
  duprSinglesRating?: number;
  duprDoublesRating?: number;
  duprLastUpdatedManually?: number;
  
  // Legacy fallback
  duprRating?: string; 
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  region?: string;
  country?: string;
  
  createdByUserId: string;
  admins: string[];
  members: string[];

  createdAt: number;
  updatedAt: number;
}

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: number;
  updatedAt: number;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  playerId: string;
  status: 'in_progress' | 'completed' | 'withdrawn';
  
  // Meta data
  waiverAccepted: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  
  // Wizard state only
  selectedEventIds: string[]; 
  
  // Updated Partner Details for Open Teams / Join Requests
  partnerDetails?: Record<
    string,
    {
      mode: 'invite' | 'open_team' | 'join_open';
      // mode = 'invite'    -> partnerUserId is the invited partner
      // mode = 'open_team' -> no partner yet, create open team
      // mode = 'join_open' -> join existing open team (openTeamId)
      partnerUserId?: string;
      openTeamId?: string;
      partnerName?: string;
      id?: string;   // Legacy support if needed, but prefer partnerUserId
      name?: string; // Legacy support
      teamId?: string;
      teamName?: string;
    }
  >;

  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'dropdown';
  required: boolean;
  options?: string[];
}

export interface Court {
  id: string;
  tournamentId: string;
  name: string;     // court name, e.g. "Court 1"
  order: number;    // sort order in UI
  active: boolean;  // whether this court is currently in rotation
  currentMatchId?: string; // Derived state for allocator
}

// --- Division Format Types ---
export type StageMode = 'single_stage' | 'two_stage';
export type MainFormat =
  | 'round_robin'
  | 'single_elim'
  | 'double_elim'
  | 'ladder'
  | 'leaderboard'
  | 'swiss';
export type Stage1Format = 'round_robin_pools';
export type Stage2Format = 'single_elim' | 'double_elim' | 'medal_rounds';
export type PlateFormat = 'single_elim' | 'round_robin';


export interface DivisionFormat {
  stageMode: StageMode;

  // Single Stage Config
  mainFormat?: MainFormat | null;

  // Two Stage Config
  stage1Format?: Stage1Format | null;
  stage2Format?: Stage2Format | null;

  // Pool Config (Two Stage)
  numberOfPools?: number | null;        // for TWO-STAGE pools, must be EVEN (2,4,6...)
  teamsPerPool?: number | null;         // minimum 4
  
  // Advancement Rules (Two Stage)
  advanceToMainPerPool?: number | null; // >= 1
  advanceToPlatePerPool?: number | null;

  // Plate Bracket (Two Stage)
  plateEnabled: boolean;
  plateFormat?: PlateFormat | null;
  plateName?: string | null;

  // Match Rules
  bestOfGames: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  hasBronzeMatch: boolean;

  // Seeding & Tie Breakers
  seedingMethod?: SeedingMethod;
  tieBreakerPrimary?: TieBreaker;
  tieBreakerSecondary?: TieBreaker;
  tieBreakerTertiary?: TieBreaker;
}
// --- Stage types (for RR, Bracket, Swiss, Leaderboard, etc.) ---

export type StageType =
  | 'round_robin'
  | 'bracket_single_elim'
  | 'bracket_double_elim'
  | 'swiss'
  | 'leaderboard';

/**
 * Settings for each stage type. This is intentionally separate
 * from DivisionFormat so we can evolve formats later without
 * breaking existing divisions.
 */
export type StageSettings =
  | RoundRobinSettings
  | BracketSettings
  | SwissSettings
  | LeaderboardSettings;

export interface RoundRobinSettings {
  kind: 'round_robin';

  // For future use if you split into groups
  groups?: number | null;

  // Best-of-X matches within RR (often 1)
  matchesPerPair?: number | null;
}

export interface BracketSettings {
  kind: 'bracket_single_elim' | 'bracket_double_elim';

  seedingMethod: SeedingMethod; // 'rating' | 'random' | 'manual'
  thirdPlacePlayoff?: boolean;
}

export interface SwissSettings {
  kind: 'swiss';

  rounds: number;

  points: {
    win: number;    // e.g. 1
    loss: number;   // e.g. 0
    draw?: number;  // if supported later
  };

  // Which tie-breakers to apply, in order
  tieBreakers: string[]; // e.g. ['buchholz', 'point_diff', 'head_to_head']
}

export interface LeaderboardSettings {
  kind: 'leaderboard';

  points: {
    win: number;
    loss: number;
    draw?: number;
  };

  // Optional season window for league / ladder
  seasonStart?: number; // timestamp ms
  seasonEnd?: number;   // timestamp ms

  // Optional cap per day to stop spamming
  maxMatchesPerDay?: number | null;
}

/**
 * A Stage is a block of play inside a Division, e.g.
 * - Pool Play (RR)
 * - Main Draw (Bracket)
 * - Swiss Rounds
 * - A Season Leaderboard
 */
export interface Stage {
  id: string;
  divisionId: string;

  name: string;         // e.g. "Pool Play", "Main Draw", "Swiss Rounds"
  type: StageType;
  order: number;        // 1, 2, 3, ... within the division

  // Which stage decides final rankings for the division
  isPrimaryRankingStage?: boolean;

  // Matches belonging to this stage
  matchIds: string[];

  settings: StageSettings;
}

/**
 * Standings within a single stage (RR, Swiss, Leaderboard, etc.)
 * This lets you have clean, separate tables per stage.
 */
export interface StageStandingsEntry {
  id: string;
  stageId: string;
  entryId: string; // singles or team entry

  wins: number;
  losses: number;
  draws: number;

  points: number;       // based on stage rules (Swiss/leaderboard)
  gamesWon?: number;
  gamesLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;

  // Useful for Swiss tie-breaks
  buchholz?: number;

  rank?: number;        // computed after sorting
}


export interface Division {
  id: string;
  tournamentId: string;
  name: string; 
  type: EventType;
  gender: GenderCategory;
  
  minRating?: number | null;
  maxRating?: number | null;
  
  minAge?: number | null;
  maxAge?: number | null;

  maxParticipants?: number | null;
  registrationOpen: boolean;
  registrationMode?: RegistrationMode;
  
  format: DivisionFormat;
  
  customFields?: CustomField[];
  
  createdByUserId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Team {
  id: string;
  tournamentId: string;
  divisionId: string;
  type: EventType;
  
  teamName?: string | null; 
  captainPlayerId: string;
  
  status: 'pending_partner' | 'active' | 'cancelled' | 'withdrawn';
  isLookingForPartner?: boolean; // True if this is an "Open Team" anyone can join. False if waiting for specific invite or full.
  
  players: string[]; // List of userIds
  
  pendingInvitedUserId?: string | null;

  createdAt?: number;
  updatedAt?: number;
  
  // Helper for UI (joined data)
  participants?: UserProfile[]; 
}

export interface PartnerInvite {
  id: string;
  tournamentId: string;
  divisionId: string;
  teamId: string;
  
  inviterId: string;
  invitedUserId: string;
  
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  inviteToken?: string | null;
  
  createdAt: number;
  respondedAt?: number | null;
  expiresAt?: number | null;
}

export interface Match {
  id: string;
  tournamentId: string;
  divisionId: string;

    // Optional: user currently controlling live scoring for this match
  scorekeeperUserId?: string | null;

  
  teamAId: string;
  teamBId: string;

    /**
   * Match lifecycle:
   * - 'scheduled'            = created, not yet played
   * - 'pending_confirmation' = someone has submitted a result, awaiting opponent confirmation
   * - 'completed'            = confirmed by both / organiser
   * - 'disputed'             = result has been disputed
   */
  status?: 'pending' | 'not_started' | 'scheduled' | 'in_progress' | 'pending_confirmation' | 'completed' | 'disputed' | 'cancelled' | 'skipped';

  /** User id of the player who submitted the latest score */
  scoreSubmittedBy?: string | null;

  /** User id of the player who must confirm or dispute the score */
  pendingConfirmationFor?: string | null;

  /** Optional free-text reason if a dispute was raised */
  disputeReason?: string | null;

  matchNumber?: number;
  roundNumber: number | null;
  stage: string | null; // "Pool A", "Main Bracket", "Bronze Match"
  
  court: string | null;      // court name
  startTime: number | null;  // timestamp ms
  endTime: number | null;
  
  scoreTeamAGames: number[]; // e.g. [11, 8, 11]
  scoreTeamBGames: number[]; // e.g. [7, 11, 9]
  winnerTeamId: string | null;
  
  lastUpdatedBy: string | null;
  lastUpdatedAt: number | null;
  
  // UI Helpers
  teamA?: Team;
  teamB?: Team;
}

export interface MatchScoreSubmission {
  id: string;
  tournamentId: string;
  matchId: string;
  
  submittedBy: string;
  teamAId: string;
  teamBId: string;
  
  submittedScore: {
    scoreTeamAGames: number[];
    scoreTeamBGames: number[];
    winnerTeamId: string;
  };
  
  status: 'pending_opponent' | 'confirmed' | 'rejected';
  opponentUserId?: string | null;
  respondedAt?: number | null;
  reasonRejected?: string | null;
  
  createdAt: number;
}

export interface StandingsEntry {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  headToHeadWins?: number;
}

export interface Tournament {
  id: string;
  name: string;
  slug: string;
  description: string;
  bannerUrl?: string; 
  logoUrl?: string;   
  sport: string;
  
  startDatetime: string;
  venue: string;
  
  visibility: Visibility;
  status: TournamentStatus;
  createdByUserId: string;

  // Top level defaults
  registrationMode?: RegistrationMode;
  registrationOpen?: boolean;
  maxParticipants?: number;
  
  // Club Info (Optional for independent competitions)
  clubId?: string; // Made optional
  clubName?: string; // Made optional
  clubLogoUrl?: string | null;

  // Scheduling / behaviour options for this tournament.
  // These are optional so existing data still works.
  settings?: TournamentSettings;
}

/**
 * Extra configuration for how the tournament runs.
 * This is where we control:
 * - live vs pre-scheduled courts
 * - default match duration
 * - other global behaviour later
 */
export interface TournamentSettings {
  // 'live' (default in the UI) or 'pre_scheduled'
  schedulingMode: SchedulingMode;

  // Used by both modes, but especially for pre-scheduled
  totalCourts?: number;

  // Useful for building pre-scheduled timetables
  defaultMatchDurationMinutes?: number;

  // In future we can add:
  // allowPlayersToEnterScores?: boolean;
  // requireScoreConfirmation?: boolean;
}

/**
 * NEW: The umbrella container for different types of competitive events.
 * Wraps existing tournaments and future leagues.
 */
export interface Competition {
  id: string;
  type: 'tournament' | 'league' | 'team_league';
  name: string;
  
  // Optional host club (allows independent competitions)
  hostClubId?: string | null;
  organizerId: string;
  
  seasonId?: string | null;
  
  // IDs of divisions (currently stored in subcollections for tournaments,
  // but good to track here for leagues).
  divisions?: string[]; 
  
  schedulingMode: 'live' | 'pre_scheduled' | 'round_robin';
  status: 'draft' | 'registration_open' | 'in_progress' | 'completed';
  
  startDate?: string;
  endDate?: string;
  
  createdAt: number;
  updatedAt: number;
}

/**
 * NEW: Generic entry record.
 * Maps a user (or pair/team) to a specific competition division.
 */
export interface CompetitionEntry {
  id: string;
  competitionId: string;
  competitionType: 'tournament' | 'league' | 'team_league';
  divisionId: string;
  
  entryType: 'individual' | 'pair' | 'team';
  
  // Who is in this entry?
  playerIds: string[]; 
  
  // If team league, which team entity?
  teamId?: string | null; 
  
  status: 'pending' | 'confirmed' | 'withdrawn';
  
  // Link back to the legacy registration object if needed
  registrationId?: string;
  
  createdAt: number;
  updatedAt: number;
}