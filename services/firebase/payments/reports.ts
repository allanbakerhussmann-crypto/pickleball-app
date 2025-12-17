/**
 * Financial Reports Service
 * 
 * Generates financial reports for:
 * - Club revenue reports
 * - Transaction summaries
 * - Platform analytics
 * - Tax/GST reports
 * - Payout reports
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/payments/reports.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  type Timestamp,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  Transaction,
  Payment,
  Refund,
  SupportedCurrency,
  ReferenceType,
  TransactionType,
} from './types';

// ============================================
// CONSTANTS
// ============================================

const REPORTS_COLLECTION = 'financial_reports';

/**
 * Report types
 */
export type ReportType = 
  | 'revenue_summary'
  | 'transaction_detail'
  | 'tax_summary'
  | 'payout_summary'
  | 'refund_summary'
  | 'annual_pass_summary'
  | 'platform_summary';

/**
 * Report period
 */
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

// ============================================
// TYPES
// ============================================

/**
 * Date range for reports
 */
export interface DateRange {
  start: number; // timestamp
  end: number; // timestamp
}

/**
 * Base report structure
 */
export interface BaseReport {
  id: string;
  type: ReportType;
  period: ReportPeriod;
  dateRange: DateRange;
  generatedAt: number;
  generatedBy?: string;
  clubId?: string;
  currency: SupportedCurrency;
}

/**
 * Revenue summary report
 */
export interface RevenueSummaryReport extends BaseReport {
  type: 'revenue_summary';
  summary: {
    grossRevenue: number;
    netRevenue: number;
    platformFees: number;
    refunds: number;
    taxCollected: number;
    transactionCount: number;
  };
  bySource: Record<ReferenceType, {
    gross: number;
    net: number;
    count: number;
  }>;
  byDay: Array<{
    date: string;
    gross: number;
    net: number;
    count: number;
  }>;
  comparison?: {
    previousPeriod: {
      grossRevenue: number;
      netRevenue: number;
      transactionCount: number;
    };
    percentageChange: {
      grossRevenue: number;
      netRevenue: number;
      transactionCount: number;
    };
  };
}

/**
 * Transaction detail report
 */
export interface TransactionDetailReport extends BaseReport {
  type: 'transaction_detail';
  transactions: Array<{
    id: string;
    date: number;
    type: TransactionType;
    referenceType: ReferenceType;
    referenceName: string;
    amount: number;
    platformFee: number;
    netAmount: number;
    status: string;
    userId: string;
  }>;
  totals: {
    count: number;
    grossAmount: number;
    platformFees: number;
    netAmount: number;
  };
}

/**
 * Tax/GST summary report
 */
export interface TaxSummaryReport extends BaseReport {
  type: 'tax_summary';
  taxDetails: {
    totalTaxableAmount: number;
    totalTaxCollected: number;
    taxRate: number;
    exemptAmount: number;
  };
  byCategory: Array<{
    category: ReferenceType;
    taxableAmount: number;
    taxCollected: number;
    transactionCount: number;
  }>;
  byMonth: Array<{
    month: string;
    taxableAmount: number;
    taxCollected: number;
  }>;
}

/**
 * Payout summary report
 */
export interface PayoutSummaryReport extends BaseReport {
  type: 'payout_summary';
  payouts: Array<{
    id: string;
    date: number;
    amount: number;
    status: string;
    bankAccount?: string;
    reference?: string;
  }>;
  summary: {
    totalPaidOut: number;
    pendingPayout: number;
    payoutCount: number;
    averagePayoutAmount: number;
  };
}

/**
 * Refund summary report
 */
export interface RefundSummaryReport extends BaseReport {
  type: 'refund_summary';
  summary: {
    totalRefunded: number;
    refundCount: number;
    averageRefundAmount: number;
    fullRefunds: number;
    partialRefunds: number;
  };
  byReason: Record<string, {
    count: number;
    amount: number;
  }>;
  bySource: Record<ReferenceType, {
    count: number;
    amount: number;
  }>;
}

/**
 * Annual pass summary report
 */
export interface AnnualPassSummaryReport extends BaseReport {
  type: 'annual_pass_summary';
  summary: {
    activePasses: number;
    newPurchases: number;
    renewals: number;
    cancellations: number;
    revenue: number;
    totalSavingsProvided: number;
  };
  usageStats: {
    totalBookings: number;
    averageBookingsPerPass: number;
    peakUsageDay: string;
    mostActiveHour: number;
  };
}

/**
 * Platform-wide summary report
 */
export interface PlatformSummaryReport extends BaseReport {
  type: 'platform_summary';
  overview: {
    totalClubs: number;
    activeClubs: number;
    totalUsers: number;
    activeUsers: number;
  };
  financials: {
    totalGrossVolume: number;
    totalPlatformRevenue: number;
    totalPayouts: number;
    averageTransactionSize: number;
  };
  byClub: Array<{
    clubId: string;
    clubName: string;
    grossVolume: number;
    platformFees: number;
    transactionCount: number;
  }>;
  trends: {
    volumeGrowth: number;
    userGrowth: number;
    clubGrowth: number;
  };
}

/**
 * Report generation options
 */
export interface ReportOptions {
  clubId?: string;
  dateRange: DateRange;
  period?: ReportPeriod;
  currency?: SupportedCurrency;
  includeComparison?: boolean;
  generatedBy?: string;
}

// ============================================
// ID GENERATION
// ============================================

/**
 * Generate unique report ID
 */
export const generateReportId = (type: ReportType, clubId?: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const prefix = clubId ? `${clubId}_` : 'platform_';
  return `rpt_${prefix}${type}_${timestamp}${random}`;
};

// ============================================
// REVENUE SUMMARY REPORT
// ============================================

/**
 * Generate revenue summary report
 */
export const generateRevenueSummaryReport = async (
  options: ReportOptions
): Promise<RevenueSummaryReport> => {
  const { clubId, dateRange, period = 'monthly', currency = 'nzd', includeComparison = false } = options;

  // Fetch transactions for the period
  const transactionsRef = collection(db, 'transactions');
  let q = query(
    transactionsRef,
    where('createdAt', '>=', dateRange.start),
    where('createdAt', '<=', dateRange.end),
    where('status', '==', 'completed')
  );

  if (clubId) {
    q = query(
      transactionsRef,
      where('odClubId', '==', clubId),
      where('createdAt', '>=', dateRange.start),
      where('createdAt', '<=', dateRange.end),
      where('status', '==', 'completed')
    );
  }

  const snap = await getDocs(q);
  const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));

  // Calculate summary
  let grossRevenue = 0;
  let platformFees = 0;
  let refunds = 0;
  let taxCollected = 0;

  const bySource: Record<string, { gross: number; net: number; count: number }> = {};
  const byDayMap: Record<string, { gross: number; net: number; count: number }> = {};

  for (const tx of transactions) {
    if (tx.type === 'refund') {
      refunds += Math.abs(tx.amount);
    } else if (tx.type === 'payment' || tx.type === 'topup') {
      grossRevenue += tx.amount;
      platformFees += tx.platformFee || 0;
      taxCollected += tx.taxAmount || 0;

      // By source
      if (!bySource[tx.referenceType]) {
        bySource[tx.referenceType] = { gross: 0, net: 0, count: 0 };
      }
      bySource[tx.referenceType].gross += tx.amount;
      bySource[tx.referenceType].net += tx.amount - (tx.platformFee || 0);
      bySource[tx.referenceType].count++;

      // By day
      const dateKey = new Date(tx.createdAt).toISOString().split('T')[0];
      if (!byDayMap[dateKey]) {
        byDayMap[dateKey] = { gross: 0, net: 0, count: 0 };
      }
      byDayMap[dateKey].gross += tx.amount;
      byDayMap[dateKey].net += tx.amount - (tx.platformFee || 0);
      byDayMap[dateKey].count++;
    }
  }

  const netRevenue = grossRevenue - platformFees - refunds;

  // Convert byDay map to sorted array
  const byDay = Object.entries(byDayMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Generate comparison if requested
  let comparison: RevenueSummaryReport['comparison'];
  if (includeComparison) {
    const periodLength = dateRange.end - dateRange.start;
    const previousRange: DateRange = {
      start: dateRange.start - periodLength,
      end: dateRange.start - 1,
    };

    const previousReport = await generateRevenueSummaryReport({
      ...options,
      dateRange: previousRange,
      includeComparison: false,
    });

    comparison = {
      previousPeriod: {
        grossRevenue: previousReport.summary.grossRevenue,
        netRevenue: previousReport.summary.netRevenue,
        transactionCount: previousReport.summary.transactionCount,
      },
      percentageChange: {
        grossRevenue: calculatePercentChange(previousReport.summary.grossRevenue, grossRevenue),
        netRevenue: calculatePercentChange(previousReport.summary.netRevenue, netRevenue),
        transactionCount: calculatePercentChange(previousReport.summary.transactionCount, transactions.length),
      },
    };
  }

  const report: RevenueSummaryReport = {
    id: generateReportId('revenue_summary', clubId),
    type: 'revenue_summary',
    period,
    dateRange,
    generatedAt: Date.now(),
    generatedBy: options.generatedBy,
    clubId,
    currency,
    summary: {
      grossRevenue,
      netRevenue,
      platformFees,
      refunds,
      taxCollected,
      transactionCount: transactions.filter(t => t.type !== 'refund').length,
    },
    bySource: bySource as Record<ReferenceType, { gross: number; net: number; count: number }>,
    byDay,
    comparison,
  };

  // Save report
  await saveReport(report);

  return report;
};

// ============================================
// TRANSACTION DETAIL REPORT
// ============================================

/**
 * Generate transaction detail report
 */
export const generateTransactionDetailReport = async (
  options: ReportOptions
): Promise<TransactionDetailReport> => {
  const { clubId, dateRange, period = 'monthly', currency = 'nzd' } = options;

  // Fetch transactions
  const transactionsRef = collection(db, 'transactions');
  let q = query(
    transactionsRef,
    where('createdAt', '>=', dateRange.start),
    where('createdAt', '<=', dateRange.end),
    orderBy('createdAt', 'desc')
  );

  if (clubId) {
    q = query(
      transactionsRef,
      where('odClubId', '==', clubId),
      where('createdAt', '>=', dateRange.start),
      where('createdAt', '<=', dateRange.end),
      orderBy('createdAt', 'desc')
    );
  }

  const snap = await getDocs(q);
  const transactions = snap.docs.map(d => {
    const data = d.data() as Transaction;
    return {
      id: d.id,
      date: data.createdAt,
      type: data.type,
      referenceType: data.referenceType,
      referenceName: data.referenceName,
      amount: data.amount,
      platformFee: data.platformFee || 0,
      netAmount: data.amount - (data.platformFee || 0),
      status: data.status,
      userId: data.odUserId,
    };
  });

  // Calculate totals
  const totals = transactions.reduce(
    (acc, tx) => ({
      count: acc.count + 1,
      grossAmount: acc.grossAmount + tx.amount,
      platformFees: acc.platformFees + tx.platformFee,
      netAmount: acc.netAmount + tx.netAmount,
    }),
    { count: 0, grossAmount: 0, platformFees: 0, netAmount: 0 }
  );

  const report: TransactionDetailReport = {
    id: generateReportId('transaction_detail', clubId),
    type: 'transaction_detail',
    period,
    dateRange,
    generatedAt: Date.now(),
    generatedBy: options.generatedBy,
    clubId,
    currency,
    transactions,
    totals,
  };

  await saveReport(report);

  return report;
};

// ============================================
// TAX SUMMARY REPORT
// ============================================

/**
 * Generate tax/GST summary report
 */
export const generateTaxSummaryReport = async (
  options: ReportOptions & { taxRate?: number }
): Promise<TaxSummaryReport> => {
  const { clubId, dateRange, period = 'monthly', currency = 'nzd', taxRate = 15 } = options;

  // Fetch completed payments
  const paymentsRef = collection(db, 'payments');
  let q = query(
    paymentsRef,
    where('createdAt', '>=', dateRange.start),
    where('createdAt', '<=', dateRange.end),
    where('status', '==', 'completed')
  );

  if (clubId) {
    q = query(
      paymentsRef,
      where('odClubId', '==', clubId),
      where('createdAt', '>=', dateRange.start),
      where('createdAt', '<=', dateRange.end),
      where('status', '==', 'completed')
    );
  }

  const snap = await getDocs(q);
  const payments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));

  // Calculate tax details
  let totalTaxableAmount = 0;
  let totalTaxCollected = 0;
  let exemptAmount = 0;

  const byCategoryMap: Record<string, { taxableAmount: number; taxCollected: number; transactionCount: number }> = {};
  const byMonthMap: Record<string, { taxableAmount: number; taxCollected: number }> = {};

  for (const payment of payments) {
    const taxAmount = payment.taxAmount || 0;
    
    if (taxAmount > 0) {
      totalTaxableAmount += payment.amount;
      totalTaxCollected += taxAmount;

      // By category
      if (!byCategoryMap[payment.referenceType]) {
        byCategoryMap[payment.referenceType] = { taxableAmount: 0, taxCollected: 0, transactionCount: 0 };
      }
      byCategoryMap[payment.referenceType].taxableAmount += payment.amount;
      byCategoryMap[payment.referenceType].taxCollected += taxAmount;
      byCategoryMap[payment.referenceType].transactionCount++;

      // By month
      const monthKey = new Date(payment.createdAt).toISOString().substring(0, 7);
      if (!byMonthMap[monthKey]) {
        byMonthMap[monthKey] = { taxableAmount: 0, taxCollected: 0 };
      }
      byMonthMap[monthKey].taxableAmount += payment.amount;
      byMonthMap[monthKey].taxCollected += taxAmount;
    } else {
      exemptAmount += payment.amount;
    }
  }

  const byCategory = Object.entries(byCategoryMap).map(([category, data]) => ({
    category: category as ReferenceType,
    ...data,
  }));

  const byMonth = Object.entries(byMonthMap)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const report: TaxSummaryReport = {
    id: generateReportId('tax_summary', clubId),
    type: 'tax_summary',
    period,
    dateRange,
    generatedAt: Date.now(),
    generatedBy: options.generatedBy,
    clubId,
    currency,
    taxDetails: {
      totalTaxableAmount,
      totalTaxCollected,
      taxRate,
      exemptAmount,
    },
    byCategory,
    byMonth,
  };

  await saveReport(report);

  return report;
};

// ============================================
// PAYOUT SUMMARY REPORT
// ============================================

/**
 * Generate payout summary report
 */
export const generatePayoutSummaryReport = async (
  options: ReportOptions
): Promise<PayoutSummaryReport> => {
  const { clubId, dateRange, period = 'monthly', currency = 'nzd' } = options;

  if (!clubId) {
    throw new Error('Club ID required for payout report');
  }

  // Fetch payouts (from transactions)
  const transactionsRef = collection(db, 'transactions');
  const q = query(
    transactionsRef,
    where('odClubId', '==', clubId),
    where('type', '==', 'payout'),
    where('createdAt', '>=', dateRange.start),
    where('createdAt', '<=', dateRange.end),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);
  const payoutTxs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));

  const payouts = payoutTxs.map(tx => ({
    id: tx.id,
    date: tx.createdAt,
    amount: Math.abs(tx.amount),
    status: tx.status,
    bankAccount: tx.metadata?.bankAccount,
    reference: tx.metadata?.reference,
  }));

  // Calculate summary
  const completedPayouts = payouts.filter(p => p.status === 'completed');
  const pendingPayouts = payouts.filter(p => p.status === 'pending');

  const totalPaidOut = completedPayouts.reduce((sum, p) => sum + p.amount, 0);
  const pendingPayout = pendingPayouts.reduce((sum, p) => sum + p.amount, 0);

  const report: PayoutSummaryReport = {
    id: generateReportId('payout_summary', clubId),
    type: 'payout_summary',
    period,
    dateRange,
    generatedAt: Date.now(),
    generatedBy: options.generatedBy,
    clubId,
    currency,
    payouts,
    summary: {
      totalPaidOut,
      pendingPayout,
      payoutCount: completedPayouts.length,
      averagePayoutAmount: completedPayouts.length > 0 
        ? Math.round(totalPaidOut / completedPayouts.length) 
        : 0,
    },
  };

  await saveReport(report);

  return report;
};

// ============================================
// REFUND SUMMARY REPORT
// ============================================

/**
 * Generate refund summary report
 */
export const generateRefundSummaryReport = async (
  options: ReportOptions
): Promise<RefundSummaryReport> => {
  const { clubId, dateRange, period = 'monthly', currency = 'nzd' } = options;

  // Fetch refunds
  const refundsRef = collection(db, 'refunds');
  let q = query(
    refundsRef,
    where('createdAt', '>=', dateRange.start),
    where('createdAt', '<=', dateRange.end)
  );

  if (clubId) {
    q = query(
      refundsRef,
      where('odClubId', '==', clubId),
      where('createdAt', '>=', dateRange.start),
      where('createdAt', '<=', dateRange.end)
    );
  }

  const snap = await getDocs(q);
  const refunds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));

  // Filter completed refunds
  const completedRefunds = refunds.filter(r => r.status === 'completed');

  // Calculate summary
  const totalRefunded = completedRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
  const fullRefunds = completedRefunds.filter(r => r.isFullRefund).length;
  const partialRefunds = completedRefunds.length - fullRefunds;

  // By reason
  const byReason: Record<string, { count: number; amount: number }> = {};
  for (const refund of completedRefunds) {
    if (!byReason[refund.reason]) {
      byReason[refund.reason] = { count: 0, amount: 0 };
    }
    byReason[refund.reason].count++;
    byReason[refund.reason].amount += refund.refundAmount;
  }

  // By source
  const bySource: Record<string, { count: number; amount: number }> = {};
  for (const refund of completedRefunds) {
    if (!bySource[refund.referenceType]) {
      bySource[refund.referenceType] = { count: 0, amount: 0 };
    }
    bySource[refund.referenceType].count++;
    bySource[refund.referenceType].amount += refund.refundAmount;
  }

  const report: RefundSummaryReport = {
    id: generateReportId('refund_summary', clubId),
    type: 'refund_summary',
    period,
    dateRange,
    generatedAt: Date.now(),
    generatedBy: options.generatedBy,
    clubId,
    currency,
    summary: {
      totalRefunded,
      refundCount: completedRefunds.length,
      averageRefundAmount: completedRefunds.length > 0 
        ? Math.round(totalRefunded / completedRefunds.length) 
        : 0,
      fullRefunds,
      partialRefunds,
    },
    byReason,
    bySource: bySource as Record<ReferenceType, { count: number; amount: number }>,
  };

  await saveReport(report);

  return report;
};

// ============================================
// ANNUAL PASS SUMMARY REPORT
// ============================================

/**
 * Generate annual pass summary report
 */
export const generateAnnualPassSummaryReport = async (
  options: ReportOptions
): Promise<AnnualPassSummaryReport> => {
  const { clubId, dateRange, period = 'monthly', currency = 'nzd' } = options;

  if (!clubId) {
    throw new Error('Club ID required for annual pass report');
  }

  // Fetch annual passes
  const passesRef = collection(db, 'annual_passes');
  const q = query(
    passesRef,
    where('odClubId', '==', clubId)
  );

  const snap = await getDocs(q);
  const passes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Filter by date range for activity
  const activePasses = passes.filter((p: any) => 
    p.status === 'active' && 
    p.endDate >= new Date().toISOString().split('T')[0]
  );

  const newPurchases = passes.filter((p: any) => 
    p.createdAt >= dateRange.start && 
    p.createdAt <= dateRange.end
  );

  const renewals = passes.filter((p: any) => 
    p.renewedAt && 
    p.renewedAt >= dateRange.start && 
    p.renewedAt <= dateRange.end
  );

  const cancellations = passes.filter((p: any) => 
    p.status === 'cancelled' &&
    p.cancelledAt >= dateRange.start && 
    p.cancelledAt <= dateRange.end
  );

  // Calculate revenue and savings
  const revenue = newPurchases.reduce((sum: number, p: any) => sum + (p.purchasePrice || 0), 0) +
    renewals.reduce((sum: number, p: any) => sum + (p.renewalPrice || 0), 0);

  const totalSavingsProvided = activePasses.reduce((sum: number, p: any) => sum + (p.totalSaved || 0), 0);

  // Usage stats
  const totalBookings = activePasses.reduce((sum: number, p: any) => sum + (p.usageCount || 0), 0);
  const averageBookingsPerPass = activePasses.length > 0 
    ? Math.round(totalBookings / activePasses.length) 
    : 0;

  const report: AnnualPassSummaryReport = {
    id: generateReportId('annual_pass_summary', clubId),
    type: 'annual_pass_summary',
    period,
    dateRange,
    generatedAt: Date.now(),
    generatedBy: options.generatedBy,
    clubId,
    currency,
    summary: {
      activePasses: activePasses.length,
      newPurchases: newPurchases.length,
      renewals: renewals.length,
      cancellations: cancellations.length,
      revenue,
      totalSavingsProvided,
    },
    usageStats: {
      totalBookings,
      averageBookingsPerPass,
      peakUsageDay: 'Saturday', // Would need more detailed usage data
      mostActiveHour: 18, // Would need more detailed usage data
    },
  };

  await saveReport(report);

  return report;
};

// ============================================
// REPORT STORAGE & RETRIEVAL
// ============================================

/**
 * Save a generated report
 */
export const saveReport = async (report: BaseReport): Promise<void> => {
  const docRef = doc(db, REPORTS_COLLECTION, report.id);
  await setDoc(docRef, report);
};

/**
 * Get a report by ID
 */
export const getReport = async <T extends BaseReport>(
  reportId: string
): Promise<T | null> => {
  const docRef = doc(db, REPORTS_COLLECTION, reportId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as T;
};

/**
 * Get reports for a club
 */
export const getClubReports = async (
  clubId: string,
  type?: ReportType,
  limitCount: number = 20
): Promise<BaseReport[]> => {
  let q = query(
    collection(db, REPORTS_COLLECTION),
    where('clubId', '==', clubId),
    orderBy('generatedAt', 'desc'),
    limit(limitCount)
  );

  if (type) {
    q = query(
      collection(db, REPORTS_COLLECTION),
      where('clubId', '==', clubId),
      where('type', '==', type),
      orderBy('generatedAt', 'desc'),
      limit(limitCount)
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BaseReport));
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate percentage change between two values
 */
export const calculatePercentChange = (previous: number, current: number): number => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
};

/**
 * Get date range for a period
 */
export const getDateRangeForPeriod = (
  period: ReportPeriod,
  referenceDate?: Date
): DateRange => {
  const now = referenceDate || new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'daily':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    
    case 'weekly':
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0);
      end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      end.setHours(23, 59, 59);
      break;
    
    case 'monthly':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    
    case 'quarterly':
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59);
      break;
    
    case 'yearly':
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
    
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  return {
    start: start.getTime(),
    end: end.getTime(),
  };
};

/**
 * Format date range for display
 */
export const formatDateRange = (dateRange: DateRange): string => {
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  
  const formatDate = (d: Date) => d.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  
  return `${formatDate(start)} - ${formatDate(end)}`;
};

/**
 * Get report type label
 */
export const getReportTypeLabel = (type: ReportType): string => {
  const labels: Record<ReportType, string> = {
    revenue_summary: 'Revenue Summary',
    transaction_detail: 'Transaction Detail',
    tax_summary: 'Tax/GST Summary',
    payout_summary: 'Payout Summary',
    refund_summary: 'Refund Summary',
    annual_pass_summary: 'Annual Pass Summary',
    platform_summary: 'Platform Summary',
  };
  return labels[type] || type;
};

/**
 * Get period label
 */
export const getPeriodLabel = (period: ReportPeriod): string => {
  const labels: Record<ReportPeriod, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
    custom: 'Custom',
  };
  return labels[period] || period;
};

/**
 * Format currency amount for reports
 */
export const formatReportAmount = (
  amount: number,
  currency: SupportedCurrency
): string => {
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  const dollars = amount / 100;
  return `${symbols[currency]}${dollars.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Calculate growth rate
 */
export const calculateGrowthRate = (
  previous: number,
  current: number
): { rate: number; direction: 'up' | 'down' | 'flat' } => {
  const rate = calculatePercentChange(previous, current);
  const direction = rate > 0 ? 'up' : rate < 0 ? 'down' : 'flat';
  return { rate: Math.abs(rate), direction };
};