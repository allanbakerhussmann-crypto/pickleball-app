/**
 * Extended Types for Meetups and Leagues with Payment Support
 * 
 * Add these types to your existing types.ts file
 * 
 * FILE LOCATION: types/payments.ts (or merge into types.ts)
 */

// ============================================
// COMPETITION TYPES
// ============================================

export type MeetupCompetitionType = 
  | 'casual'              // No formal competition
  | 'round_robin'         // Everyone plays everyone
  | 'single_elimination'  // Lose once, you're out
  | 'double_elimination'  // Must lose twice
  | 'king_of_court'       // Winners stay, losers rotate
  | 'ladder'              // Challenge system
  | 'swiss'               // Pair by record
  | 'pool_play_knockout'; // Groups then brackets

export type LeagueCompetitionType = 
  | 'round_robin'         // Standard league - play all teams
  | 'ladder'              // Challenge system
  | 'division'            // Multiple divisions
  | 'swiss'               // Paired by record
  | 'split_season'        // Two halves
  | 'conference_playoff'; // Regular season + playoffs

// ============================================
// FEE CONFIGURATION
// ============================================

export type FeePaidBy = 'organizer' | 'player';

export interface PricingConfig {
  enabled: boolean;
  
  // Entry fee (goes to organizer)
  entryFee: number;              // In cents
  memberEntryFee?: number;       // Discounted rate for members
  
  // Prize pool (distributed to winners)
  prizePoolEnabled: boolean;
  prizePoolContribution: number; // Per person, in cents
  prizeDistribution?: {
    first: number;               // Percentage (e.g., 50)
    second: number;              // Percentage (e.g., 30)
    third: number;               // Percentage (e.g., 20)
    fourth?: number;
  };
  
  // Who pays platform + stripe fees
  feesPaidBy: FeePaidBy;
  
  // Currency
  currency: string;              // 'nzd', 'usd', etc.
}

// ============================================
// MEETUP TYPES (EXTENDED)
// ============================================

export interface MeetupPricing {
  enabled: boolean;
  
  // Entry fee
  entryFee: number;              // In cents (e.g., 500 = $5.00)
  memberEntryFee?: number;       // Optional discounted rate
  
  // Prize pool
  prizePoolEnabled: boolean;
  prizePoolContribution: number; // Per person contribution
  prizeDistribution?: {
    first: number;
    second: number;
    third?: number;
    fourth?: number;
  };
  
  // Fee handling
  feesPaidBy: FeePaidBy;
  
  // Calculated totals (for display)
  totalPerPerson?: number;       // entryFee + prizePool + fees (if player pays)
  
  currency: string;
}

export interface MeetupCompetitionSettings {
  // Is competition managed in the app?
  managedInApp: boolean;
  
  // Competition type
  type: MeetupCompetitionType;
  
  // Settings vary by type
  settings: {
    // Round Robin
    gamesPerMatch?: number;      // 1, 3, 5 (best of)
    pointsPerWin?: number;
    pointsPerDraw?: number;
    
    // Elimination
    consolationBracket?: boolean;
    thirdPlaceMatch?: boolean;
    
    // Pool Play
    poolSize?: number;
    teamsAdvancing?: number;
    
    // Swiss
    numberOfRounds?: number;
    
    // King of Court
    winStreak?: number;          // Wins to stay on
    
    // General
    scoringSystem?: 'rally' | 'side_out';
    pointsToWin?: number;
    winBy?: number;
    timeLimit?: number;          // Minutes per game
  };
}

export interface ExtendedMeetup {
  id: string;
  title: string;
  description: string;
  when: number;                  // Timestamp
  endTime?: number;              // Optional end time
  visibility: 'public' | 'linkOnly' | 'private';
  maxPlayers: number;
  locationName: string;
  location?: { lat: number; lng: number };
  
  // Organizer
  createdByUserId: string;
  organizerName?: string;
  
  // Club link (optional)
  clubId?: string;
  clubName?: string;
  
  // Payment - NEW
  pricing?: MeetupPricing;
  organizerStripeAccountId?: string;  // Organizer's Stripe Connect
  
  // Competition - NEW
  competition?: MeetupCompetitionSettings;
  
  // Status
  status: 'draft' | 'active' | 'cancelled' | 'completed';
  cancelledAt?: number;
  cancelReason?: string;
  
  // Stats
  currentPlayers?: number;
  paidPlayers?: number;
  totalCollected?: number;       // In cents
  
  createdAt: number;
  updatedAt: number;
}

// ============================================
// MEETUP ATTENDEE (EXTENDED)
// ============================================

export type AttendeePaymentStatus = 
  | 'not_required'    // Free meetup
  | 'pending'         // Waiting for payment
  | 'paid'            // Paid successfully
  | 'refunded'        // Refunded
  | 'waived';         // Fee waived by organizer

export interface ExtendedMeetupRSVP {
  odUserId: string;
  odUserName: string;
  
  status: 'going' | 'maybe' | 'waitlist' | 'cancelled';
  
  // Payment - NEW
  paymentStatus: AttendeePaymentStatus;
  amountPaid?: number;           // In cents
  paidAt?: number;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  
  // Competition - NEW
  seed?: number;                 // For brackets
  rank?: number;                 // Current rank in ladder
  poolGroup?: string;            // A, B, C, etc.
  
  createdAt: number;
  updatedAt?: number;
}

// ============================================
// LEAGUE TYPES (EXTENDED)
// ============================================

export interface LeaguePricing {
  enabled: boolean;
  
  // Registration type
  type: 'per_player' | 'per_team';
  
  // Fees
  registrationFee: number;       // In cents
  memberRegistrationFee?: number;
  teamFee?: number;              // For team leagues
  perPlayerFee?: number;         // Per player on team
  
  // Prize pool
  prizePoolEnabled: boolean;
  prizePoolContribution: number;
  prizeDistribution?: {
    first: number;
    second: number;
    third?: number;
    fourth?: number;
  };
  
  // Early bird
  earlyBirdEnabled: boolean;
  earlyBirdFee?: number;
  earlyBirdDeadline?: number;    // Timestamp
  
  // Late fee
  lateFeeEnabled: boolean;
  lateFee?: number;
  lateRegistrationStart?: number;
  
  // Fee handling
  feesPaidBy: FeePaidBy;
  
  currency: string;
}

export interface LeagueCompetitionSettings {
  managedInApp: boolean;
  type: LeagueCompetitionType;
  
  settings: {
    // Season structure
    weeksInSeason?: number;
    matchesPerWeek?: number;
    roundsCount?: number;
    
    // Playoffs
    playoffTeams?: number;
    playoffFormat?: 'single_elimination' | 'double_elimination' | 'best_of_3' | 'best_of_5';
    
    // Divisions
    divisions?: string[];
    promotionSpots?: number;
    relegationSpots?: number;
    
    // Ladder
    challengeRangeUp?: number;
    challengeRangeDown?: number;
    challengeTimeout?: number;   // Days to respond
    
    // Swiss
    tiebreakers?: ('head_to_head' | 'point_diff' | 'points_for' | 'games_won')[];
  };
}

export interface ExtendedLeague {
  id: string;
  name: string;
  description: string;
  type: 'singles' | 'doubles' | 'mixed_doubles' | 'team';
  format: 'ladder' | 'round_robin' | 'swiss' | 'division' | 'playoffs';
  
  // Club link (optional)
  clubId?: string | null;
  clubName?: string | null;
  
  // Organizer
  createdByUserId: string;
  organizerName?: string;
  
  // Dates
  seasonStart: number;
  seasonEnd: number;
  registrationDeadline?: number | null;
  
  // Payment - NEW
  pricing?: LeaguePricing;
  organizerStripeAccountId?: string;
  
  // Competition - NEW
  competition?: LeagueCompetitionSettings;
  
  // Status
  status: 'draft' | 'registration' | 'active' | 'playoffs' | 'completed' | 'cancelled';
  
  // Settings (existing)
  settings: {
    pointsForWin: number;
    pointsForDraw: number;
    pointsForLoss: number;
    gamesPerMatch: 1 | 3 | 5;
    pointsPerGame: 11 | 15 | 21;
    winBy: 1 | 2;
    allowSelfReporting: boolean;
    requireConfirmation: boolean;
    challengeRangeUp?: number | null;
    maxMembers?: number | null;
    minRating?: number | null;
    maxRating?: number | null;
  };
  
  // Stats
  memberCount: number;
  matchesPlayed: number;
  paidMemberCount?: number;
  totalCollected?: number;
  
  location?: string | null;
  region?: string | null;
  visibility: 'public' | 'private' | 'club_only';
  
  createdAt: number;
  updatedAt: number;
}

// ============================================
// LEAGUE MEMBER (EXTENDED)
// ============================================

export interface ExtendedLeagueMember {
  id: string;
  leagueId: string;
  
  odUserId: string;
  partnerUserId?: string | null;
  teamId?: string | null;
  
  displayName: string;
  partnerDisplayName?: string | null;
  teamName?: string | null;
  
  status: 'pending' | 'active' | 'suspended' | 'withdrawn';
  role: 'member' | 'captain' | 'admin';
  
  // Payment - NEW
  paymentStatus: AttendeePaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  
  // Rankings
  currentRank: number;
  previousRank?: number | null;
  peakRank?: number | null;
  divisionId?: string;
  
  // Stats
  stats: {
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
  };
  
  joinedAt: number;
  lastActiveAt: number;
}

// ============================================
// USER PROFILE EXTENSIONS
// ============================================

export interface OrganizerProfile {
  isOrganizer: boolean;
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeCreatedAt?: number;
  stripeUpdatedAt?: number;
  
  // Stats
  totalMeetupsOrganized?: number;
  totalLeaguesOrganized?: number;
  totalPaymentsReceived?: number;  // In cents
}

// ============================================
// COMPETITION RESULT TYPES
// ============================================

export interface CompetitionMatch {
  id: string;
  eventId: string;               // Meetup or League ID
  eventType: 'meetup' | 'league';
  
  // Players/Teams
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  
  // For doubles
  partner1Id?: string;
  partner1Name?: string;
  partner2Id?: string;
  partner2Name?: string;
  
  // Bracket info
  roundNumber?: number;
  matchNumber?: number;
  bracketType?: 'winners' | 'losers' | 'finals';
  poolGroup?: string;
  
  // Status
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit';
  
  // Scores
  scores: Array<{
    player1Score: number;
    player2Score: number;
  }>;
  
  winnerId?: string;
  winnerName?: string;
  
  // Timing
  scheduledTime?: number;
  startedAt?: number;
  completedAt?: number;
  
  court?: string;
}

export interface CompetitionStanding {
  odUserId: string;
  odUserName: string;
  rank: number;
  
  played: number;
  wins: number;
  losses: number;
  draws: number;
  
  points: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}