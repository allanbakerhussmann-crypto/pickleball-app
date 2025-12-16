/**
 * Reporting System Types
 * 
 * Type definitions for reports, exports, and tax summaries.
 * 
 * FILE LOCATION: services/firebase/reporting/types.ts
 */

import type { SupportedCurrency, ReferenceType, TransactionType } from '../payments/types';
import type { DateRange } from '../accounting/types';

// ============================================
// REPORT TYPES
// ============================================

export type ReportType = 
  | 'user_statement'
  | 'user_tax_summary'
  | 'club_revenue'
  | 'club_transactions'
  | 'club_members'
  | 'club_payouts'
  | 'tournament_pnl'
  | 'tournament_entries'
  | 'league_finances'
  | 'league_members'
  | 'platform_overview';

export type ReportStatus = 'queued' | 'generating' | 'ready' | 'failed' | 'expired';
export type ExportFormat = 'pdf' | 'csv' | 'xlsx' | 'json';

export interface Report {
  id: string;
  type: ReportType;
  
  /** Scope of the report */
  odUserId?: string;
  odClubId?: string;
  tournamentId?: string;
  leagueId?: string;
  
  /** Date range covered */
  dateRange: DateRange;
  
  /** Report title */
  title: string;
  description?: string;
  
  /** Status */
  status: ReportStatus;
  
  /** Generated files */
  pdfUrl?: string;
  csvUrl?: string;
  xlsxUrl?: string;
  
  /** Report data (JSON) */
  data?: ReportData;
  
  /** File sizes in bytes */
  pdfSize?: number;
  csvSize?: number;
  
  /** Generation info */
  generatedAt?: number;
  generatedByUserId?: string;
  
  /** Expiry (for cleanup) */
  expiresAt?: number;
  
  /** Error info if failed */
  errorMessage?: string;
  
  createdAt: number;
  updatedAt: number;
}

export interface ReportData {
  /** Summary metrics */
  summary: Record<string, number | string>;
  /** Detailed rows */
  rows: ReportRow[];
  /** Totals */
  totals?: Record<string, number>;
  /** Charts data */
  charts?: ChartData[];
}

export interface ReportRow {
  [key: string]: string | number | boolean | null;
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'doughnut';
  title: string;
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

// ============================================
// USER STATEMENT TYPES
// ============================================

export interface UserStatementReport {
  userId: string;
  userName: string;
  dateRange: DateRange;
  currency: SupportedCurrency;
  
  /** Summary */
  openingBalance?: number;
  totalCredits: number;
  totalDebits: number;
  closingBalance?: number;
  
  /** Transactions */
  transactions: UserStatementTransaction[];
  
  /** By category breakdown */
  spendingByCategory: Record<string, number>;
  
  /** By club breakdown */
  spendingByClub: { clubId: string; clubName: string; amount: number }[];
  
  generatedAt: number;
}

export interface UserStatementTransaction {
  date: number;
  description: string;
  referenceType: ReferenceType;
  referenceName: string;
  clubName?: string;
  credit?: number;
  debit?: number;
  balance?: number;
  receiptUrl?: string;
}

// ============================================
// TAX SUMMARY TYPES
// ============================================

export interface TaxYearSummary {
  userId: string;
  userName: string;
  taxYear: string; // e.g., '2024' or '2024-2025' for NZ tax year
  currency: SupportedCurrency;
  
  /** Totals */
  totalSpent: number;
  totalRefunded: number;
  netSpent: number;
  
  /** GST/Tax breakdown (if applicable) */
  taxPaid?: number;
  taxableAmount?: number;
  
  /** By category */
  byCategory: TaxCategoryBreakdown[];
  
  /** By club */
  byClub: TaxClubBreakdown[];
  
  /** Monthly breakdown */
  monthlyTotals: { month: string; amount: number }[];
  
  /** Receipts list */
  receipts: TaxReceipt[];
  
  generatedAt: number;
}

export interface TaxCategoryBreakdown {
  category: ReferenceType;
  categoryLabel: string;
  amount: number;
  transactionCount: number;
  taxAmount?: number;
}

export interface TaxClubBreakdown {
  clubId: string;
  clubName: string;
  taxNumber?: string;
  amount: number;
  taxAmount?: number;
  transactionCount: number;
}

export interface TaxReceipt {
  date: number;
  receiptNumber: string;
  description: string;
  amount: number;
  taxAmount?: number;
  clubName?: string;
  receiptUrl?: string;
}

// ============================================
// CLUB REVENUE REPORT TYPES
// ============================================

export interface ClubRevenueReport {
  clubId: string;
  clubName: string;
  dateRange: DateRange;
  currency: SupportedCurrency;
  
  /** Summary */
  totalRevenue: number;
  totalRefunds: number;
  totalPayouts: number;
  platformFees: number;
  netRevenue: number;
  
  /** Pending */
  pendingPayout: number;
  
  /** By source */
  revenueBySource: RevenueSourceBreakdown[];
  
  /** By day/week/month */
  revenueOverTime: TimeSeriesData[];
  
  /** Payment methods */
  paymentMethodBreakdown: PaymentMethodData[];
  
  /** Top members by revenue */
  topMembers: TopMemberData[];
  
  /** Comparison to previous period */
  previousPeriodRevenue: number;
  revenueChange: number;
  revenueChangePercent: number;
  
  generatedAt: number;
}

export interface RevenueSourceBreakdown {
  source: ReferenceType;
  sourceLabel: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface TimeSeriesData {
  date: string; // ISO date or 'YYYY-MM' or 'Week X'
  amount: number;
  count: number;
}

export interface PaymentMethodData {
  method: string;
  methodLabel: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface TopMemberData {
  userId: string;
  displayName: string;
  totalSpent: number;
  transactionCount: number;
  walletBalance?: number;
  hasActivePass: boolean;
}

// ============================================
// CLUB MEMBER REPORT TYPES
// ============================================

export interface ClubMemberReport {
  clubId: string;
  clubName: string;
  dateRange: DateRange;
  
  /** Summary */
  totalMembers: number;
  membersWithWallet: number;
  membersWithPass: number;
  totalWalletBalance: number;
  
  /** Members list */
  members: MemberFinancialData[];
  
  /** Outstanding balances */
  totalOutstanding: number;
  membersWithOutstanding: number;
  
  generatedAt: number;
}

export interface MemberFinancialData {
  userId: string;
  displayName: string;
  email?: string;
  joinedAt: number;
  
  /** Wallet */
  walletBalance: number;
  walletStatus: string;
  
  /** Pass */
  hasActivePass: boolean;
  passExpiresAt?: string;
  
  /** Activity */
  totalSpent: number;
  transactionCount: number;
  lastTransactionAt?: number;
  
  /** Outstanding (if any owed) */
  outstandingAmount?: number;
}

// ============================================
// TOURNAMENT P&L REPORT TYPES
// ============================================

export interface TournamentPnLReport {
  tournamentId: string;
  tournamentName: string;
  startDate: string;
  endDate: string;
  currency: SupportedCurrency;
  
  /** Revenue */
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  
  /** Entries */
  totalEntries: number;
  paidEntries: number;
  unpaidEntries: number;
  withdrawnEntries: number;
  
  /** By division */
  divisionBreakdown: DivisionFinancialData[];
  
  /** Expenses */
  expenses: ExpenseItem[];
  totalExpenses: number;
  
  /** Profit/Loss */
  netProfit: number;
  profitMargin: number;
  
  /** Platform fees */
  platformFees: number;
  
  /** Payment status */
  paymentStatusSummary: {
    paid: number;
    pending: number;
    unpaid: number;
    refunded: number;
  };
  
  generatedAt: number;
}

export interface DivisionFinancialData {
  divisionId: string;
  divisionName: string;
  entryFee: number;
  entries: number;
  paidEntries: number;
  revenue: number;
  refunds: number;
  netRevenue: number;
}

export interface ExpenseItem {
  category: string;
  description: string;
  amount: number;
  date?: number;
  paidTo?: string;
  receiptUrl?: string;
}

// ============================================
// PAYOUT REPORT TYPES
// ============================================

export interface PayoutReport {
  clubId: string;
  clubName: string;
  dateRange: DateRange;
  currency: SupportedCurrency;
  
  /** Summary */
  totalPayouts: number;
  payoutCount: number;
  averagePayoutAmount: number;
  
  /** Pending */
  pendingAmount: number;
  
  /** Payouts list */
  payouts: PayoutSummary[];
  
  /** Bank account info (masked) */
  bankAccountLast4?: string;
  bankName?: string;
  
  generatedAt: number;
}

export interface PayoutSummary {
  id: string;
  amount: number;
  status: string;
  initiatedAt: number;
  paidAt?: number;
  expectedArrivalAt?: number;
  transactionCount: number;
  grossAmount: number;
  platformFees: number;
}

// ============================================
// SCHEDULED REPORT TYPES
// ============================================

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ScheduledReport {
  id: string;
  
  /** Report configuration */
  reportType: ReportType;
  odUserId?: string;
  odClubId?: string;
  
  /** Schedule */
  frequency: ScheduleFrequency;
  dayOfWeek?: number; // For weekly
  dayOfMonth?: number; // For monthly
  timeOfDay: string; // HH:MM
  timezone: string;
  
  /** Delivery */
  emailTo: string[];
  includeFormats: ExportFormat[];
  
  /** Status */
  isActive: boolean;
  lastRunAt?: number;
  nextRunAt: number;
  lastReportId?: string;
  
  /** Failure tracking */
  consecutiveFailures: number;
  lastError?: string;
  
  createdByUserId: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// EXPORT TYPES
// ============================================

export interface ExportRequest {
  id: string;
  
  /** What to export */
  entityType: 'transactions' | 'payments' | 'members' | 'payouts' | 'report';
  entityId?: string; // If exporting a specific report
  
  /** Filters */
  filters: ExportFilters;
  
  /** Format */
  format: ExportFormat;
  
  /** Status */
  status: 'queued' | 'processing' | 'ready' | 'failed';
  
  /** Output */
  fileUrl?: string;
  fileSize?: number;
  rowCount?: number;
  
  /** Error */
  errorMessage?: string;
  
  /** Expiry */
  expiresAt: number;
  
  requestedByUserId: string;
  createdAt: number;
  completedAt?: number;
}

export interface ExportFilters {
  odUserId?: string;
  odClubId?: string;
  tournamentId?: string;
  leagueId?: string;
  startDate?: number;
  endDate?: number;
  transactionType?: TransactionType;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}

// ============================================
// COLUMN DEFINITIONS FOR EXPORTS
// ============================================

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';
  width?: number;
  format?: string; // For dates, currency format, etc.
}

export const TRANSACTION_EXPORT_COLUMNS: ColumnDefinition[] = [
  { key: 'id', label: 'Transaction ID', type: 'string' },
  { key: 'createdAt', label: 'Date', type: 'datetime' },
  { key: 'type', label: 'Type', type: 'string' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'amount', label: 'Amount', type: 'currency' },
  { key: 'currency', label: 'Currency', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'paymentMethod', label: 'Payment Method', type: 'string' },
  { key: 'referenceType', label: 'Category', type: 'string' },
  { key: 'referenceName', label: 'Reference', type: 'string' },
  { key: 'receiptNumber', label: 'Receipt #', type: 'string' },
];

export const MEMBER_EXPORT_COLUMNS: ColumnDefinition[] = [
  { key: 'userId', label: 'User ID', type: 'string' },
  { key: 'displayName', label: 'Name', type: 'string' },
  { key: 'email', label: 'Email', type: 'string' },
  { key: 'joinedAt', label: 'Joined', type: 'date' },
  { key: 'walletBalance', label: 'Wallet Balance', type: 'currency' },
  { key: 'hasActivePass', label: 'Has Pass', type: 'boolean' },
  { key: 'passExpiresAt', label: 'Pass Expires', type: 'date' },
  { key: 'totalSpent', label: 'Total Spent', type: 'currency' },
  { key: 'transactionCount', label: 'Transactions', type: 'number' },
  { key: 'lastTransactionAt', label: 'Last Activity', type: 'date' },
];

export const PAYOUT_EXPORT_COLUMNS: ColumnDefinition[] = [
  { key: 'id', label: 'Payout ID', type: 'string' },
  { key: 'initiatedAt', label: 'Initiated', type: 'datetime' },
  { key: 'amount', label: 'Amount', type: 'currency' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'paidAt', label: 'Paid Date', type: 'datetime' },
  { key: 'transactionCount', label: 'Transactions', type: 'number' },
  { key: 'grossAmount', label: 'Gross', type: 'currency' },
  { key: 'platformFees', label: 'Fees', type: 'currency' },
];