
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
export type SchedulingMode = 'live' | 'pre_scheduled';

export type SeedingMethod = 'random' | 'rating' | 'manual';
export type TieBreaker = 'match_wins' | 'point_diff' | 'head_to_head';

export type EventType = 'singles' | 'doubles';
export type GenderCategory = 'men' | 'women' | 'mixed' | 'open';

export type UserRole = 'player' | 'organizer' | 'admin';
export type UserGender = 'male' | 'female';

// Replaces UserProfile conceptually, maps to 'players' collection or 'users'
export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  roles: UserRole[];
  isRootAdmin?: boolean; 
  
  createdAt?: number;
  updatedAt?: number;
  
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
  
  duprProfileUrl?: string;
  duprSinglesRating?: number;
  duprDoublesRating?: number;
  duprLastUpdatedManually?: number;
  
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

export interface Registration {
  id: string;
  tournamentId: string;
  playerId: string;
  status: 'in_progress' | 'completed' | 'withdrawn';
  
  waiverAccepted: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  
  selectedEventIds: string[]; 
  
  partnerDetails?: Record<
    string,
    {
      mode: 'invite' | 'open_team' | 'join_open';
      partnerUserId?: string;
      openTeamId?: string;
      partnerName?: string;
      id?: string;
      name?: string;
      teamId?: string;
      teamName?: string;
    }
  >;

  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export type TournamentRegistration = Registration;

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
  name: string;
  order: number;
  active: boolean;
  currentMatchId?: string;
}

export type StageMode = 'single_stage' | 'two_stage';
export type MainFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'ladder' | 'leaderboard' | 'swiss';
export type Stage1Format = 'round_robin_pools';
export type Stage2Format = 'single_elim' | 'double_elim' | 'medal_rounds';
export type PlateFormat = 'single_elim' | 'round_robin';

export interface DivisionFormat {
  stageMode: StageMode;
  mainFormat?: MainFormat | null;
  stage1Format?: Stage1Format | null;
  stage2Format?: Stage2Format | null;
  numberOfPools?: number | null;
  teamsPerPool?: number | null;
  advanceToMainPerPool?: number | null;
  advanceToPlatePerPool?: number | null;
  plateEnabled: boolean;
  plateFormat?: PlateFormat | null;
  plateName?: string | null;
  bestOfGames: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  hasBronzeMatch: boolean;
  seedingMethod?: SeedingMethod;
  tieBreakerPrimary?: TieBreaker;
  tieBreakerSecondary?: TieBreaker;
  tieBreakerTertiary?: TieBreaker;
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

// Normalized Team (No players array)
export interface Team {
  id: string;
  tournamentId: string;
  divisionId: string;
  teamName?: string | null; 
  captainPlayerId: string;
  
  status: 'pending_partner' | 'active' | 'cancelled' | 'withdrawn';
  isLookingForPartner?: boolean;
  
  pendingInvitedUserId?: string | null; // Kept for invite logic convenience

  createdAt?: number;
  updatedAt?: number;
  
  // Optional for UI convenience when hydrated, but not in DB schema
  players?: string[]; 
  participants?: UserProfile[]; 
}

// Join collection linking Players to Teams
export interface TeamPlayer {
  id: string;
  teamId: string;
  playerId: string;
  role: 'captain' | 'member';
}

export interface PartnerInvite {
  id: string;
  tournamentId: string;
  divisionId: string;
  teamId: string;
  
  inviterId: string;
  invitedUserId: string;
  
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  inviteToken?: string | null;
  
  createdAt: number;
  respondedAt?: number | null;
  expiresAt?: number | null;
}

// Normalized Match
export interface Match {
  id: string;
  tournamentId?: string; // Optional for league matches
  competitionId?: string; // Added for leagues
  divisionId: string;
  scorekeeperUserId?: string | null;
  
  status?: 'pending' | 'not_started' | 'scheduled' | 'in_progress' | 'pending_confirmation' | 'completed' | 'disputed' | 'cancelled' | 'skipped';

  scoreSubmittedBy?: string | null;
  pendingConfirmationFor?: string | null;
  disputeReason?: string | null;

  matchNumber?: number;
  roundNumber: number | null;
  stage: string | null;
  
  court: string | null;
  startTime: number | null;
  endTime: number | null;
  
  winnerTeamId: string | null;
  
  lastUpdatedBy: string | null;
  lastUpdatedAt: number | null;

  // Hydrated properties for UI (not in DB match doc)
  teamAId?: string;
  teamBId?: string;
  scoreTeamAGames?: number[];
  scoreTeamBGames?: number[];
  teamA?: Team;
  teamB?: Team;
}

// Join collection linking Matches to Teams
export interface MatchTeam {
  id: string;
  matchId: string;
  teamId: string;
  isHomeTeam?: boolean; // Can be used to distinguish Team A vs Team B if needed, or rely on sorting
  scoreGames: number[]; // Array of scores for this team [game1, game2, ...]
}

export interface MatchScoreSubmission {
  id: string;
  tournamentId?: string;
  competitionId?: string;
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
  tournamentId?: string;
  competitionId?: string;
  divisionId?: string;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  headToHeadWins?: number;
  points?: number; // League points
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

  registrationMode?: RegistrationMode;
  registrationOpen?: boolean;
  maxParticipants?: number;
  
  clubId: string;
  clubName: string;
  clubLogoUrl?: string | null;

  settings?: TournamentSettings;
}

export interface TournamentSettings {
  schedulingMode: SchedulingMode;
  totalCourts?: number;
  defaultMatchDurationMinutes?: number;
}

/* -------------------------------------------------------------------------- */
/*                               COMPETITIONS                                 */
/* -------------------------------------------------------------------------- */

export type CompetitionType = 'league' | 'team_league' | 'tournament';

export interface CompetitionDivision {
  id: string;
  name: string;
  minRating?: number;
  maxRating?: number;
  gender?: GenderCategory;
}

export interface Competition {
  id: string;
  type: CompetitionType;
  name: string;
  hostClubId?: string;
  organiserId: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  country?: string;
  region?: string;
  settings?: {
    points: {
      win: number;
      loss: number;
      draw?: number;
      bonus?: number; 
    };
    tieBreaker?: 'match_wins' | 'point_diff' | 'head_to_head';
    waitlist?: boolean;
    teamRegistrationMode?: 'pre_registered' | 'on_entry';
  };
  // Expanded Metadata
  description?: string;
  venue?: string;
  maxEntrants?: number;
  visibility: Visibility;
  registrationOpen: boolean;
  divisions?: CompetitionDivision[];
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  entryType: 'team' | 'individual';
  teamId?: string;
  playerId?: string;
  divisionId?: string;       
  status: 'pending' | 'active' | 'withdrawn';
  createdAt: number;
}

export type StageSettings = DivisionFormat;

// Optional: if you want multi-stage leagues (e.g. round robin + playoffs)
export interface CompetitionStage {
  id: string;
  competitionId: string;
  name: string;
  type: 'round_robin' | 'single_elim' | 'double_elim' | 'swiss';
  order: number;
  settings: StageSettings;
}

/* -------------------------------------------------------------------------- */
/*                               MESSAGING                                    */
/* -------------------------------------------------------------------------- */

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'action_required' | 'success' | 'error';
  link?: string;
  read: boolean;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entityId?: string;
  details?: any;
  timestamp: number;
}
