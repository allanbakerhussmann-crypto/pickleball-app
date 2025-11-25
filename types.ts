
export type TournamentFormat = 'single_elim' | 'double_elim' | 'round_robin' | 'leaderboard' | 'round_robin_knockout';
export type TournamentStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type RegistrationMode = 'signup_page' | 'organiser_provided';
export type Visibility = 'public' | 'private';

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
    }
  >;

  createdAt: number;
  updatedAt: number;
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
}

// --- Division Format Types ---
export type StageMode = 'single_stage' | 'two_stage';
export type MainFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'ladder';
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
  
  teamAId: string;
  teamBId: string;
  
  roundNumber: number | null;
  stage: string | null; // "Pool A", "Main Bracket", "Bronze Match"
  
  court: string | null;      // court name
  startTime: number | null;  // timestamp ms
  endTime: number | null;
  
  status: 'pending' | 'in_progress' | 'completed' | 'disputed';
  
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
  opponentUserId: string;
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
  
  // Club Info (Required)
  clubId: string;
  clubName: string;
  clubLogoUrl?: string | null;
}
