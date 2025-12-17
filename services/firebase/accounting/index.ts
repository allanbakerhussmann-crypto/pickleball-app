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
// USER ACCOUNT SERVICE EXPORTS
// ============================================

export {
  // Get & Create
  getUserAccount,
  getOrCreateUserAccount,
  subscribeToUserAccount,
  
  // Update operations
  recordUserPayment,
  recordUserRefund,
  recordUserTopUp,
  updateUserWalletCount,
  updateUserPassCount,
  
  // Spending queries
  getUserTotalSpending,
  getUserMonthlySpending,
  getUserClubSpending,
  getUserSpendingByCategory,
  getUserSpendingTrend,
  getUserTopClubs,
  
  // Financial summary
  getUserFinancialSummary,
  
  // Batch operations
  recalculateUserAccount,
  
  // Helpers
  formatSpendingAmount,
  getSpendingCategoryLabel,
} from './userAccount';

// ============================================
// CLUB ACCOUNT SERVICE EXPORTS
// ============================================

export {
  // Get & Create
  getClubAccount,
  getOrCreateClubAccount,
  subscribeToClubAccount,
  
  // Revenue recording
  recordClubRevenue,
  recordClubRefund,
  recordClubPayout,
  
  // Member statistics
  updateClubMemberCount,
  updateClubWalletCount,
  updateClubPassCount,
  syncClubMemberStats,
  
  // Payout settings
  updateClubPayoutSettings,
  getClubPayoutSettings,
  
  // Revenue queries
  getClubTotalRevenue,
  getClubNetRevenue,
  getClubPendingPayout,
  getClubMonthlyRevenue,
  getClubRevenueBySource,
  getClubRevenueTrend,
  getClubPaymentMethodBreakdown,
  
  // Financial summary
  getClubFinancialSummary,
  
  // Batch operations
  recalculateClubAccount,
  
  // Helpers
  getRevenueSourceLabel,
  getPaymentMethodLabel,
  formatRevenueAmount,
  calculateRevenueGrowth,
} from './clubAccount';

// ============================================
// TOURNAMENT ACCOUNT SERVICE EXPORTS
// ============================================

export {
  // Get & Create
  getTournamentAccount,
  getOrCreateTournamentAccount,
  subscribeToTournamentAccount,
  
  // Registration & Revenue
  recordTournamentRegistration,
  recordTournamentRefund,
  markPlayerPaymentPending,
  waivePlayerFee,
  
  // Division management
  initializeDivision,
  updateDivisionEntryFee,
  getDivisionRevenue,
  
  // Expenses
  recordTournamentExpense,
  adjustTournamentExpense,
  getTournamentExpenses,
  
  // Player queries
  getPlayerPaymentStatuses,
  getUnpaidPlayers,
  getPaidPlayers,
  getPlayerPaymentStatus,
  
  // Financial summary
  getTournamentFinancialSummary,
  
  // Batch operations
  recalculateTournamentAccount,
  
  // Constants & helpers
  TOURNAMENT_EXPENSE_CATEGORIES,
  type TournamentExpenseCategory,
  getExpenseCategoryLabel,
} from './tournamentAccount';

// ============================================
// LEAGUE ACCOUNT SERVICE EXPORTS
// ============================================

export {
  // Get & Create
  getLeagueAccount,
  getOrCreateLeagueAccount,
  subscribeToLeagueAccount,
  
  // Member fee management
  updateLeagueMemberFee,
  getLeagueMemberFee,
  
  // Member payments
  recordLeagueMemberPayment,
  recordLeagueMemberRefund,
  addLeagueMemberPending,
  removeLeagueMember,
  waiveLeagueMemberFee,
  
  // Expenses
  recordLeagueExpense,
  adjustLeagueExpense,
  getLeagueExpenses,
  
  // Member queries
  getMemberPaymentStatuses,
  getUnpaidMembers,
  getPaidMembers,
  getMemberPaymentStatus,
  
  // Financial summary
  getLeagueFinancialSummary,
  
  // Season management
  resetLeagueForNewSeason,
  
  // Batch operations
  recalculateLeagueAccount,
  
  // Constants & helpers
  LEAGUE_EXPENSE_CATEGORIES,
  type LeagueExpenseCategory,
  getLeagueExpenseCategoryLabel,
  calculatePerMemberCost,
  suggestMemberFee,
} from './leagueAccount';

// ============================================
// SERVICE EXPORTS (to be added as we build them)
// ============================================

// Payout services
// export * from './payouts';

// Retention services
// export * from './retention';