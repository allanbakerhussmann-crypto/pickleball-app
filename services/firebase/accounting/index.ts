/**
 * Accounting Services - Main Entry Point
 * 
 * Re-exports all accounting-related types and functions.
 * 
 * FILE LOCATION: services/firebase/accounting/index.ts
 */

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // User Account
  UserAccount,
  SpendingByCategory,
  
  // Club Account
  ClubAccount,
  RevenueBySource,
  PaymentMethodBreakdown,
  ClubBrandingSettings,
  
  // Tournament Account
  TournamentAccount,
  DivisionRevenue,
  PlayerPaymentStatus,
  
  // League Account
  LeagueAccount,
  MemberPaymentStatus,
  
  // Financial Summaries
  UserFinancialSummary,
  UserClubFinancialSummary,
  ClubFinancialSummary,
  TransactionSummary,
  
  // Date Range
  DateRangePreset,
  DateRange,
  
  // Retention
  RetentionRecord,
} from './types';

// ============================================
// FACTORY FUNCTION EXPORTS
// ============================================

export {
  createEmptyUserAccount,
  createEmptyClubAccount,
  createEmptyTournamentAccount,
  createEmptyLeagueAccount,
} from './types';

// ============================================
// HELPER FUNCTION EXPORTS
// ============================================

export {
  getDateRangeFromPreset,
  calculateArchiveDate,
} from './types';

// ============================================
// SERVICE EXPORTS (to be added as we build them)
// ============================================

// User account services
// export * from './userAccount';

// Club account services
// export * from './clubAccount';

// Tournament account services
// export * from './tournamentAccount';

// League account services
// export * from './leagueAccount';

// Payout services
// export * from './payouts';

// Retention services
// export * from './retention';