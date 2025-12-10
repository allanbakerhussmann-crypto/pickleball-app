
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

// Alias for backward compatibility during refactor
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

export type StageType =
  | 'round_robin'
  | 'bracket_single_elim'
  | 'bracket_double_elim'
  | 'swiss'
  | 'leaderboard';

export type StageSettings =
  | RoundRobinSettings
  | BracketSettings
  | SwissSettings
  | LeaderboardSettings;

export interface RoundRobinSettings {
  kind: 'round_robin';
  groups?: number | null;
  matchesPerPair?: number | null;
}

export interface BracketSettings {
  kind: 'bracket_single_elim' | 'bracket_double_elim';
  seedingMethod: SeedingMethod;
  thirdPlacePlayoff?: boolean;
}

export interface SwissSettings {
  kind: 'swiss';
  rounds: number;
  points: {
    win: number;
    loss: number;
    draw?: number;
  };
  tieBreakers: string[];
}

export interface LeaderboardSettings {
  kind: 'leaderboard';
  points: {
    win: number;
    loss: number;
    draw?: number;
  };
  seasonStart?: number;
  seasonEnd?: number;
  maxMatchesPerDay?: number | null;
}

export interface Stage {
  id: string;
  divisionId: string;
  name: string;
  type: StageType;
  order: number;
  isPrimaryRankingStage?: boolean;
  matchIds: string[];
  settings: StageSettings;
}

export interface StageStandingsEntry {
  id: string;
  stageId: string;
  entryId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  gamesWon?: number;
  gamesLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  buchholz?: number;
  rank?: number;
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
  isLookingForPartner?: boolean;
  
  players: string[];
  
  pendingInvitedUserId?: string | null;

  createdAt?: number;
  updatedAt?: number;
  
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
  scorekeeperUserId?: string | null;
  
  teamAId: string;
  teamBId: string;

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
  
  scoreTeamAGames: number[];
  scoreTeamBGames: number[];
  winnerTeamId: string | null;
  
  lastUpdatedBy: string | null;
  lastUpdatedAt: number | null;
  
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
  tournamentId?: string; // Added for flat structure compliance
  divisionId?: string;   // Added for flat structure compliance
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
