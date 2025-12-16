/**
 * Reporting Services - Main Entry Point
 * 
 * Re-exports all reporting-related types and functions.
 * 
 * FILE LOCATION: services/firebase/reporting/index.ts
 */

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // Report Types
  ReportType,
  ReportStatus,
  ExportFormat,
  Report,
  ReportData,
  ReportRow,
  ChartData,
  ChartDataset,
  
  // User Statement
  UserStatementReport,
  UserStatementTransaction,
  
  // Tax Summary
  TaxYearSummary,
  TaxCategoryBreakdown,
  TaxClubBreakdown,
  TaxReceipt,
  
  // Club Revenue Report
  ClubRevenueReport,
  RevenueSourceBreakdown,
  TimeSeriesData,
  PaymentMethodData,
  TopMemberData,
  
  // Club Member Report
  ClubMemberReport,
  MemberFinancialData,
  
  // Tournament P&L
  TournamentPnLReport,
  DivisionFinancialData,
  ExpenseItem,
  
  // Payout Report
  PayoutReport,
  PayoutSummary,
  
  // Scheduled Reports
  ScheduleFrequency,
  ScheduledReport,
  
  // Export
  ExportRequest,
  ExportFilters,
  ColumnDefinition,
} from './types';

// ============================================
// CONSTANT EXPORTS
// ============================================

export {
  TRANSACTION_EXPORT_COLUMNS,
  MEMBER_EXPORT_COLUMNS,
  PAYOUT_EXPORT_COLUMNS,
} from './types';

// ============================================
// SERVICE EXPORTS (to be added as we build them)
// ============================================

// User report services
// export * from './userReports';

// Club report services
// export * from './clubReports';

// Tax report services
// export * from './taxReports';

// Export services
// export * from './exportService';

// Receipt generator services
// export * from './receiptGenerator';