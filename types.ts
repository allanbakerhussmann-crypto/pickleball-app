/**
 * Pickleball Director - Type Definitions
 * 
 * Complete type definitions for the application
 * 
 * FILE LOCATION: types.ts (root directory)
 */

// ============================================
// CORE ENUMS & TYPES
// ============================================

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

// ============================================
// USER PROFILE
// ============================================

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

// ============================================
// CLUB TYPES
// ============================================

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

  bookingSettings?: ClubBookingSettings;
}

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: number;
  updatedAt: number;
}

// ============================================
// SOCIAL EVENTS & MEETUPS
// ============================================

export interface SocialEvent {
  id: string;
  hostUserId: string;
  hostName: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  location: string;
  maxPlayers: number;
  attendees: string[];
  createdAt: number;
}

export type MeetupStatus = 'active' | 'cancelled';

export interface Meetup {
  id: string;
  title: string;
  description: string;
  when: number;
  visibility: 'public' | 'linkOnly';
  maxPlayers: number;
  locationName: string;
  location?: { lat: number; lng: number };
  createdByUserId: string;
  createdAt: number;
  updatedAt: number;
  
  status?: MeetupStatus;
  cancelledAt?: number;
  cancelReason?: string;
}

export interface MeetupRSVP {
  userId: string;
  status: 'going' | 'maybe';
  createdAt: number;
  userProfile?: UserProfile;
}

// ============================================
// TOURNAMENT TYPES
// ============================================

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

export interface TournamentRegistration {
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

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'dropdown';
  required: boolean;
  options?: string[];
}

// ============================================
// DIVISION TYPES
// ============================================

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

// ============================================
// STAGE TYPES
// ============================================

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

// ============================================
// TEAM TYPES
// ============================================

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

// ============================================
// MATCH TYPES
// ============================================

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

// ============================================
// TOURNAMENT COURT (for tournaments)
// ============================================

export interface Court {
  id: string;
  tournamentId: string;
  name: string;
  order: number;
  active: boolean;
  currentMatchId?: string;
}

// ============================================
// LEAGUE TYPES
// ============================================

export type LeagueType = 'singles' | 'doubles' | 'team';
export type LeagueFormat = 'ladder' | 'round_robin' | 'swiss';
export type LeagueStatus = 'draft' | 'registration' | 'active' | 'completed' | 'cancelled';

export interface League {
  id: string;
  name: string;
  description: string;
  
  type: LeagueType;
  format: LeagueFormat;
  
  clubId?: string | null;
  clubName?: string | null;
  createdByUserId: string;
  
  seasonStart: number;
  seasonEnd: number;
  registrationDeadline?: number | null;
  
  status: LeagueStatus;
  settings: LeagueSettings;
  
  location?: string | null;
  region?: string | null;
  visibility: 'public' | 'private' | 'club_only';
  
  memberCount: number;
  matchesPlayed: number;
  
  createdAt: number;
  updatedAt: number;
}

export interface LeagueSettings {
  minRating?: number | null;
  maxRating?: number | null;
  maxMembers?: number | null;
  
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  
  gamesPerMatch: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  
  matchDays?: string[];
  matchesPerWeek?: number | null;
  
  allowSelfReporting: boolean;
  requireConfirmation: boolean;
  
  challengeRangeUp?: number | null;
  challengeRangeDown?: number | null;
  roundsCount?: number | null;
}

export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'withdrawn';
export type MemberRole = 'member' | 'captain' | 'admin';

export interface LeagueMember {
  id: string;
  leagueId: string;
  
  userId: string;
  partnerUserId?: string | null;
  teamId?: string | null;
  
  displayName: string;
  partnerDisplayName?: string | null;
  teamName?: string | null;
  
  status: MembershipStatus;
  role: MemberRole;
  
  currentRank: number;
  previousRank?: number | null;
  peakRank?: number | null;
  
  stats: MemberStats;
  
  joinedAt: number;
  lastActiveAt: number;
}

export interface MemberStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  currentStreak: number;
  bestWinStreak: number;
  recentForm: ('W' | 'L' | 'D')[];
}

export type LeagueMatchStatus =
  | 'scheduled'
  | 'pending_confirmation'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'forfeit';

export type LeagueMatchType = 'regular' | 'challenge' | 'playoff';

export interface LeagueMatch {
  id: string;
  leagueId: string;
  
  memberAId: string;
  memberBId: string;
  
  userAId: string;
  userBId: string;
  partnerAId?: string | null;
  partnerBId?: string | null;
  
  memberAName: string;
  memberBName: string;
  
  matchType: LeagueMatchType;
  weekNumber?: number | null;
  roundNumber?: number | null;
  
  scheduledDate?: number | null;
  court?: string | null;
  
  status: LeagueMatchStatus;
  
  scores: GameScore[];
  winnerMemberId?: string | null;
  
  memberARankAtMatch?: number | null;
  memberBRankAtMatch?: number | null;
  
  submittedByUserId?: string | null;
  confirmedByUserId?: string | null;
  disputeReason?: string | null;
  
  createdAt: number;
  playedAt?: number | null;
  completedAt?: number | null;
}

export interface GameScore {
  gameNumber: number;
  scoreA: number;
  scoreB: number;
}

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'completed';

export interface LeagueChallenge {
  id: string;
  leagueId: string;
  matchId?: string | null;
  
  challengerMemberId: string;
  challengerUserId: string;
  challengerRank: number;
  
  defenderId: string;
  defenderUserId: string;
  defenderRank: number;
  
  status: ChallengeStatus;
  
  respondByDate: number;
  playByDate?: number | null;
  
  declineReason?: string | null;
  
  createdAt: number;
  respondedAt?: number | null;
}

// ============================================
// COURT BOOKING TYPES (BASIC)
// ============================================

export interface ClubCourt {
  id: string;
  clubId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  
  // Enhanced fields (optional)
  grade?: CourtGrade;
  useCustomPricing?: boolean;
  customBasePrice?: number;
  customPeakPrice?: number;
  customWeekendPrice?: number;
  location?: CourtLocation;
  surfaceType?: CourtSurface;
  features?: CourtFeatures;
  additionalFees?: {
    lighting?: CourtAdditionalFee;
    equipment?: CourtAdditionalFee;
    ballMachine?: CourtAdditionalFee;
  };
  status?: CourtStatus;
}

export interface ClubBookingSettings {
  enabled: boolean;
  slotDurationMinutes: 30 | 60 | 90 | 120;
  openTime: string;
  closeTime: string;
  maxAdvanceBookingDays: number;
  maxBookingsPerMemberPerDay: number;
  cancellationMinutesBeforeSlot: number;
  allowNonMembers: boolean;
  
  // Enhanced fields (optional)
  currency?: 'nzd' | 'aud' | 'usd';
  peakHours?: PeakHoursConfig;
  weekendPricingEnabled?: boolean;
  courtGrades?: Record<CourtGrade, CourtGradeConfig>;
  useCustomGradeNames?: boolean;
  visitors?: VisitorSettings;
  paymentMethods?: PaymentMethodsConfig;
  stripeAccountId?: string;
  stripeAccountStatus?: 'pending' | 'active' | 'restricted';
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface CourtBooking {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  
  date: string;
  startTime: string;
  endTime: string;
  
  bookedByUserId: string;
  bookedByName: string;
  
  players?: {
    userId?: string;
    name: string;
  }[];
  
  status: BookingStatus;
  cancelledAt?: number | null;
  cancelledByUserId?: string | null;
  
  notes?: string | null;
  
  createdAt: number;
  updatedAt: number;
}

export interface CalendarSlot {
  time: string;
  courtId: string;
  courtName: string;
  booking: CourtBooking | null;
  isPast: boolean;
  isBookable: boolean;
}

export interface CalendarDay {
  date: string;
  dateLabel: string;
  slots: CalendarSlot[];
}

// ============================================
// COURT BOOKING TYPES (ENHANCED)
// ============================================

export type CourtGrade = 'standard' | 'premium' | 'elite';

export interface CourtGradeConfig {
  id: CourtGrade;
  name: string;
  description: string;
  icon: string;
  basePrice: number;
  peakPrice: number;
  weekendPrice: number;
  memberPricing: 'free' | 'discounted' | 'full';
  memberDiscountPercent?: number;
  visitorPremiumPercent: number;
}

export type CourtLocation = 'indoor' | 'outdoor' | 'covered';
export type CourtSurface = 'concrete' | 'asphalt' | 'cushioned' | 'wood' | 'synthetic' | 'other';
export type CourtStatus = 'active' | 'inactive' | 'maintenance';

export interface CourtFeatures {
  hasLights: boolean;
  climateControlled: boolean;
  ballMachineAvailable: boolean;
  livestreamCapable: boolean;
}

export interface CourtAdditionalFee {
  enabled: boolean;
  amount: number;
  description?: string;
  appliesAfter?: string;
}

export interface PeakHoursConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
  days: number[];
}

export interface VisitorSettings {
  allowVisitors: boolean;
  visitorFeeEnabled: boolean;
  visitorFee: number;
  visitorFeeType: 'per_day' | 'per_booking';
  visitorCourtPricing: 'same' | 'premium' | 'custom';
  visitorPremiumPercent?: number;
  visitorCustomPrice?: number;
  requireMemberSignIn: boolean;
  maxVisitorBookingsPerDay?: number;
}

export interface PaymentMethodsConfig {
  acceptPayAsYouGo: boolean;
  acceptWallet: boolean;
  walletTopUpAmounts: number[];
  allowCustomTopUp: boolean;
  minTopUp?: number;
  maxTopUp?: number;
  acceptAnnualPass: boolean;
  annualPassPrice?: number;
  annualPassBenefit: 'unlimited' | 'discounted';
  annualPassDiscountPercent?: number;
  annualPassPriorityDays?: number;
  passFeeToCustomer: boolean;
}

// Enhanced ClubCourt (full version)
export interface ClubCourtEnhanced {
  id: string;
  clubId: string;
  name: string;
  description?: string;
  grade: CourtGrade;
  useCustomPricing: boolean;
  customBasePrice?: number;
  customPeakPrice?: number;
  customWeekendPrice?: number;
  location: CourtLocation;
  surfaceType: CourtSurface;
  features: CourtFeatures;
  additionalFees: {
    lighting?: CourtAdditionalFee;
    equipment?: CourtAdditionalFee;
    ballMachine?: CourtAdditionalFee;
  };
  status: CourtStatus;
  isActive: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// Enhanced ClubBookingSettings (full version)
export interface ClubBookingSettingsEnhanced {
  enabled: boolean;
  currency: 'nzd' | 'aud' | 'usd';
  slotDurationMinutes: 30 | 60 | 90;
  openTime: string;
  closeTime: string;
  peakHours: PeakHoursConfig;
  weekendPricingEnabled: boolean;
  courtGrades: Record<CourtGrade, CourtGradeConfig>;
  useCustomGradeNames: boolean;
  visitors: VisitorSettings;
  maxAdvanceBookingDays: number;
  maxBookingsPerMemberPerDay: number;
  cancellationMinutesBeforeSlot: number;
  paymentMethods: PaymentMethodsConfig;
  stripeAccountId?: string;
  stripeAccountStatus?: 'pending' | 'active' | 'restricted';
}

// ============================================
// WALLET & PAYMENT TYPES
// ============================================

export interface ClubWallet {
  id: string;
  odUserId: string;
  odClubId: string;
  balance: number;
  currency: 'nzd' | 'aud' | 'usd';
  totalLoaded: number;
  totalSpent: number;
  createdAt: number;
  updatedAt: number;
}

export type WalletTransactionType = 'topup' | 'payment' | 'refund' | 'adjustment';

export interface WalletTransaction {
  id: string;
  walletId: string;
  odUserId: string;
  odClubId: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  stripePaymentIntentId?: string;
  referenceType?: 'court_booking' | 'tournament' | 'league';
  referenceId?: string;
  referenceName?: string;
  reason?: string;
  adjustedByUserId?: string;
  createdAt: number;
}

export type AnnualPassStatus = 'active' | 'expired' | 'cancelled' | 'refunded';

export interface AnnualPass {
  id: string;
  odUserId: string;
  odClubId: string;
  startDate: string;
  endDate: string;
  status: AnnualPassStatus;
  amountPaid: number;
  stripePaymentIntentId: string;
  purchasedAt: number;
  bookingsUsed: number;
  autoRenew: boolean;
  stripeSubscriptionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VisitorFeePayment {
  id: string;
  odUserId: string;
  odClubId: string;
  date: string;
  amount: number;
  stripePaymentIntentId?: string;
  walletTransactionId?: string;
  createdAt: number;
}

export interface BookingPriceResult {
  courtFee: number;
  lightingFee: number;
  equipmentFee: number;
  visitorFee: number;
  subtotal: number;
  processingFee: number;
  total: number;
  breakdown: { label: string; amount: number }[];
  discounts: { label: string; amount: number }[];
  priceType: 'standard' | 'peak' | 'weekend';
  courtGrade: CourtGrade;
  isMember: boolean;
  hasAnnualPass: boolean;
  isVisitor: boolean;
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================
// IMPORTANT: Order matters - define standalone constants first,
// then the ones that reference them

export const DEFAULT_BOOKING_SETTINGS: ClubBookingSettings = {
  enabled: false,
  slotDurationMinutes: 60,
  openTime: '06:00',
  closeTime: '22:00',
  maxAdvanceBookingDays: 14,
  maxBookingsPerMemberPerDay: 2,
  cancellationMinutesBeforeSlot: 60,
  allowNonMembers: false,
};

export const DEFAULT_COURT_GRADES: Record<CourtGrade, CourtGradeConfig> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Basic outdoor courts',
    icon: '🥉',
    basePrice: 500,
    peakPrice: 800,
    weekendPrice: 600,
    memberPricing: 'discounted',
    memberDiscountPercent: 50,
    visitorPremiumPercent: 25,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Covered courts with quality surface',
    icon: '🥈',
    basePrice: 1000,
    peakPrice: 1400,
    weekendPrice: 1200,
    memberPricing: 'discounted',
    memberDiscountPercent: 50,
    visitorPremiumPercent: 25,
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    description: 'Indoor climate-controlled courts',
    icon: '🥇',
    basePrice: 1500,
    peakPrice: 2000,
    weekendPrice: 1800,
    memberPricing: 'discounted',
    memberDiscountPercent: 30,
    visitorPremiumPercent: 50,
  },
};

export const DEFAULT_VISITOR_SETTINGS: VisitorSettings = {
  allowVisitors: true,
  visitorFeeEnabled: true,
  visitorFee: 1000,
  visitorFeeType: 'per_day',
  visitorCourtPricing: 'premium',
  visitorPremiumPercent: 25,
  requireMemberSignIn: false,
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethodsConfig = {
  acceptPayAsYouGo: true,
  acceptWallet: true,
  walletTopUpAmounts: [2500, 5000, 10000],
  allowCustomTopUp: false,
  acceptAnnualPass: true,
  annualPassPrice: 20000,
  annualPassBenefit: 'unlimited',
  annualPassPriorityDays: 7,
  passFeeToCustomer: true,
};

export const DEFAULT_PEAK_HOURS: PeakHoursConfig = {
  enabled: true,
  startTime: '17:00',
  endTime: '20:00',
  days: [1, 2, 3, 4, 5],
};

// This MUST be last because it references the above constants
export const DEFAULT_BOOKING_SETTINGS_ENHANCED: ClubBookingSettingsEnhanced = {
  enabled: false,
  currency: 'nzd',
  slotDurationMinutes: 60,
  openTime: '06:00',
  closeTime: '22:00',
  peakHours: DEFAULT_PEAK_HOURS,
  weekendPricingEnabled: true,
  courtGrades: DEFAULT_COURT_GRADES,
  useCustomGradeNames: false,
  visitors: DEFAULT_VISITOR_SETTINGS,
  maxAdvanceBookingDays: 14,
  maxBookingsPerMemberPerDay: 2,
  cancellationMinutesBeforeSlot: 60,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};