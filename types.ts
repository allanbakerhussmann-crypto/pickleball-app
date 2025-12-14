
export type UserRole = 'player' | 'organizer' | 'admin';
export type UserGender = 'male' | 'female' | '';

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  photoData?: string;
  photoMimeType?: string;
  roles: UserRole[];
  isRootAdmin?: boolean;
  birthDate?: string;
  gender?: UserGender;
  country?: string;
  region?: string;
  phone?: string;
  duprId?: string;
  duprProfileUrl?: string;
  duprSinglesRating?: number | null;
  duprDoublesRating?: number | null;
  duprRating?: number;
  ratingSingles?: number;
  ratingDoubles?: number;
  duprLastUpdatedManually?: number;
  playsHand?: 'right' | 'left' | '';
  height?: string;
  createdAt?: number;
  updatedAt?: number;
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

export interface GameSession {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  location: string;
  startDatetime: string; // ISO string
  durationMinutes: number;
  courtCount: number;
  maxPlayers: number;
  minRating?: number;
  maxRating?: number;
  description?: string;
  playerIds: string[];
  status: 'open' | 'full' | 'cancelled' | 'completed';
  createdAt: number;
}

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: number;
}

export type EventType = 'singles' | 'doubles';
export type GenderCategory = 'men' | 'women' | 'mixed' | 'open';
export type MainFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'ladder';
export type Stage2Format = 'single_elim' | 'double_elim' | 'medal_rounds';
export type PlateFormat = 'single_elim' | 'round_robin';
export type SeedingMethod = 'rating' | 'random' | 'manual';
export type TieBreaker = 'match_wins' | 'point_diff' | 'head_to_head';

export interface DivisionFormat {
  stageMode: 'single_stage' | 'two_stage';
  mainFormat?: MainFormat;
  stage1Format?: string;
  stage2Format?: Stage2Format;
  numberOfPools?: number;
  teamsPerPool?: number;
  advanceToMainPerPool?: number;
  advanceToPlatePerPool?: number;
  plateEnabled?: boolean;
  plateFormat?: PlateFormat;
  plateName?: string;
  bestOfGames: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  hasBronzeMatch: boolean;
  seedingMethod: SeedingMethod;
  tieBreakerPrimary: TieBreaker;
  tieBreakerSecondary: TieBreaker;
  tieBreakerTertiary: TieBreaker;
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
  registrationOpen: boolean;
  format: DivisionFormat;
  createdByUserId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  bannerUrl?: string;
  visibility: 'public' | 'private';
  sport: string;
  status: string;
  registrationMode: string;
  createdByUserId: string;
  clubId?: string;
  clubName?: string;
  clubLogoUrl?: string;
  startDatetime: string;
  endDate?: string;
  venue?: string;
  slug?: string;
}

export interface Team {
  id: string;
  tournamentId?: string;
  competitionId?: string;
  divisionId: string;
  teamName?: string | null;
  players: string[];
  captainPlayerId?: string;
  status: 'active' | 'pending_partner' | 'withdrawn' | 'cancelled';
  isLookingForPartner?: boolean;
  pendingInvitedUserId?: string | null;
  createdByUserId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface TeamPlayer {
  id: string;
  teamId: string;
  playerId: string;
  role: 'captain' | 'member';
}

export interface PartnerInvite {
  id: string;
  tournamentId: string;
  competitionId?: string;
  divisionId: string;
  teamId: string;
  inviterId: string;
  invitedUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: number;
  respondedAt?: number;
}

export interface Registration {
  id: string;
  tournamentId: string;
  playerId: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  waiverAccepted: boolean;
  selectedEventIds: string[];
  checkedIn?: boolean;
  checkedInAt?: number;
  partnerDetails?: Record<string, {
      mode: 'invite' | 'open_team' | 'join_open';
      partnerUserId?: string;
      partnerName?: string;
      teamId?: string;
      openTeamId?: string;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface Board {
  boardNumber: number;
  boardType: string;
  weight?: number;
  teamAPlayers?: { id: string; name: string }[];
  teamBPlayers?: { id: string; name: string }[];
  scoreTeamAGames?: number[];
  scoreTeamBGames?: number[];
  status: string;
  winnerTeamId?: string | null;
}

export interface Match {
  id: string;
  tournamentId?: string;
  competitionId?: string;
  divisionId: string;
  teamAId: string;
  teamBId: string;
  status: string;
  roundNumber?: number;
  stage?: string;
  court?: string | null;
  matchNumber?: number;
  startTime?: number | null;
  endTime?: number | null;
  winnerTeamId?: string | null;
  scoreTeamAGames: number[];
  scoreTeamBGames: number[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: number;
  disputeReason?: string | null;
  boards?: Board[];
  aggregate?: {
      teamAPoints: number;
      teamBPoints: number;
      winnerTeamId: string | null;
  };
}

export interface MatchTeam {
  id: string;
  matchId: string;
  teamId: string;
  isHomeTeam: boolean;
  scoreGames: number[];
}

export interface Court {
  id: string;
  tournamentId: string;
  name: string;
  order: number;
  active: boolean;
  currentMatchId?: string;
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
  draws?: number; 
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  headToHeadWins?: number;
  points?: number;
  boardWins?: number;
  boardLosses?: number;
  updatedAt?: number;
}

// Competition / League specific
export type CompetitionType = 'league' | 'team_league';
export type Visibility = 'public' | 'private';

export interface TeamLeagueBoardConfig {
  boardNumber: number;
  boardType: string;
  type?: string; 
  weight: number;
}

export interface TeamLeagueSettings {
  boards: TeamLeagueBoardConfig[];
  rosterMin: number;
  rosterMax: number;
  lineupLockMinutesBeforeMatch: number;
  pointsPerBoardWin: number;
  pointsPerMatchWin: number;
  tieBreakerOrder: string[];
}

export interface CompetitionDivision {
  id: string;
  name: string;
  type: EventType;
  gender: GenderCategory;
  minRating?: number;
  maxRating?: number;
  minAge?: number;
  maxAge?: number;
}

export interface Competition {
  id: string;
  type: CompetitionType;
  name: string;
  organiserId: string;
  startDate: string;
  endDate: string;
  status: string;
  settings: {
      points: { win: number; draw: number; loss: number; bonus?: number };
      tieBreaker: TieBreaker;
      waitlist?: boolean;
      teamRegistrationMode?: 'on_entry' | 'pre_registered';
      teamLeague?: TeamLeagueSettings;
      teamMatchConfig?: { boards: TeamLeagueBoardConfig[] };
  };
  visibility: Visibility;
  registrationOpen: boolean;
  description?: string;
  venue?: string;
  country?: string;
  region?: string;
  maxEntrants?: number;
  divisions?: CompetitionDivision[];
  createdAt?: number;
  updatedAt?: number;
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  entryType: 'individual' | 'team';
  playerId?: string;
  teamId?: string;
  divisionId?: string;
  status: 'active' | 'withdrawn' | 'waitlist';
  createdAt: number;
  partnerDetails?: any;
}

export interface MatchScoreSubmission {
  id?: string;
  tournamentId?: string | null;
  competitionId?: string | null;
  matchId: string;
  submittedBy: string;
  teamAId: string;
  teamBId: string;
  submittedScore: {
      scoreTeamAGames: number[];
      scoreTeamBGames: number[];
      winnerTeamId?: string | null;
      boardIndex?: number | null;
  };
  status: 'pending_opponent' | 'confirmed' | 'rejected';
  reasonRejected?: string;
  createdAt: number;
  respondedAt?: number;
}

export interface TeamRoster {
  id: string; 
  teamId: string;
  players: string[]; 
  captainPlayerId?: string;
  updatedAt: number;
}

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
  action: string;
  actorId: string;
  entityId?: string;
  timestamp: number;
  details?: any;
}
